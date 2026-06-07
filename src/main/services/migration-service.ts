import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { once } from 'events'
import { Client } from 'pg'
import { assertSafeIdentifier, parsePostgresConnection, type ParsedConnection } from './connection'
import { resolvePgTools } from './pg-tools'

export type MigrationPhase =
  | 'idle'
  | 'validating'
  | 'checking-tools'
  | 'creating-database'
  | 'dumping'
  | 'restoring'
  | 'done'
  | 'error'
  | 'cancelled'

export interface MigrationRequest {
  sourceUrl: string
  destinationAdminUrl: string
  targetDatabase?: string
  dropExisting: boolean
}

export interface TestConnectionResult {
  ok: boolean
  serverVersion?: string
  database?: string
  message: string
}

type ChildProcessName = 'pg_dump' | 'pg_restore'

export class MigrationService extends EventEmitter {
  static readonly instance = new MigrationService()

  private running = false
  private cancelled = false
  private activeChildren = new Map<ChildProcessName, ChildProcessWithoutNullStreams>()

  private constructor() {
    super()
  }

  async run(request: MigrationRequest): Promise<void> {
    if (this.running) {
      throw new Error('A migration is already running.')
    }

    this.running = true
    this.cancelled = false
    this.activeChildren.clear()

    try {
      this.setPhase('validating')
      const source = parsePostgresConnection(request.sourceUrl)
      const destination = parsePostgresConnection(request.destinationAdminUrl)
      const targetDatabase = (request.targetDatabase?.trim() || source.database).trim()

      assertSafeIdentifier(targetDatabase)

      if (targetDatabase === destination.database) {
        throw new Error('Target database must be different from the destination admin database.')
      }

      this.log(`Preparing to copy database "${source.database}" into "${targetDatabase}".`)

      const [sourceVersion, destinationVersion] = await Promise.all([
        this.readServerVersion(source),
        this.readServerVersion(destination)
      ])
      const minToolMajor = Math.max(
        serverMajor(sourceVersion.serverVersionNum),
        serverMajor(destinationVersion.serverVersionNum)
      )

      this.setPhase('checking-tools')
      const tools = await resolvePgTools(minToolMajor)
      this.log(`Found ${tools.dumpVersion}.`)
      this.log(`Found ${tools.restoreVersion}.`)

      this.throwIfCancelled()
      this.setPhase('creating-database')
      await this.createTargetDatabase(destination, targetDatabase, request.dropExisting)

      this.throwIfCancelled()
      this.setPhase('dumping')
      this.log('Starting streamed dump and restore.')
      await this.streamDumpRestore(source, destination, targetDatabase, tools.dump, tools.restore)

      this.throwIfCancelled()
      this.setPhase('done')
      this.log('Migration completed successfully.')
    } catch (error) {
      if (this.cancelled) {
        this.setPhase('cancelled')
        this.log('Migration cancelled.')
        return
      }

      this.setPhase('error')
      this.log(error instanceof Error ? error.message : 'Migration failed.')
      throw error
    } finally {
      this.running = false
      this.cancelled = false
      this.killActiveChildren()
      this.activeChildren.clear()
    }
  }

  async test(connectionString: string): Promise<TestConnectionResult> {
    try {
      const connection = parsePostgresConnection(connectionString)
      const version = await this.readServerVersion(connection)

      return {
        ok: true,
        serverVersion: version.serverVersion,
        database: connection.database,
        message: `Connected to "${connection.database}".`
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection test failed.'
      }
    }
  }

  cancel(): void {
    if (!this.running) return

    this.cancelled = true
    this.killActiveChildren()
  }

  private async createTargetDatabase(
    destination: ParsedConnection,
    targetDatabase: string,
    dropExisting: boolean
  ): Promise<void> {
    const client = new Client(destination.clientConfig)
    await client.connect()

    try {
      const existing = await client.query<{ exists: boolean }>(
        'select exists(select 1 from pg_database where datname = $1)',
        [targetDatabase]
      )

      if (existing.rows[0]?.exists) {
        if (!dropExisting) {
          throw new Error(`Destination database "${targetDatabase}" already exists.`)
        }

        this.log(`Dropping existing database "${targetDatabase}".`)
        await client.query(`DROP DATABASE "${targetDatabase}"`)
      }

      this.log(`Creating database "${targetDatabase}".`)
      await client.query(`CREATE DATABASE "${targetDatabase}" TEMPLATE template0`)
    } finally {
      await client.end()
    }
  }

  private async readServerVersion(connection: ParsedConnection): Promise<{
    serverVersion: string
    serverVersionNum: number
  }> {
    const client = new Client(connection.clientConfig)
    await client.connect()

    try {
      const result = await client.query<{ server_version: string; server_version_num: string }>(
        "select current_setting('server_version') as server_version, current_setting('server_version_num') as server_version_num"
      )
      const row = result.rows[0]

      return {
        serverVersion: row.server_version,
        serverVersionNum: Number(row.server_version_num)
      }
    } finally {
      await client.end()
    }
  }

  private async streamDumpRestore(
    source: ParsedConnection,
    destination: ParsedConnection,
    targetDatabase: string,
    pgDump: string,
    pgRestore: string
  ): Promise<void> {
    const restoreEnv: NodeJS.ProcessEnv = {
      ...destination.env,
      PGDATABASE: targetDatabase
    }

    const dump = spawn(pgDump, ['-Fc', '--dbname', source.database], {
      env: { ...process.env, ...source.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const restore = spawn(pgRestore, ['--single-transaction', '--dbname', targetDatabase], {
      env: { ...process.env, ...restoreEnv },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.activeChildren.set('pg_dump', dump)
    this.activeChildren.set('pg_restore', restore)

    dump.stderr.on('data', (chunk: Buffer) => this.logToolOutput('pg_dump', chunk))
    restore.stderr.on('data', (chunk: Buffer) => this.logToolOutput('pg_restore', chunk))
    restore.stdout.on('data', (chunk: Buffer) => this.logToolOutput('pg_restore', chunk))

    this.setPhase('restoring')
    dump.stdin.end()
    dump.stdout.pipe(restore.stdin)
    dump.on('error', () => restore.kill('SIGTERM'))
    restore.on('error', () => dump.kill('SIGTERM'))

    const [dumpExit, restoreExit] = await Promise.all([waitForExit(dump), waitForExit(restore)])

    this.activeChildren.delete('pg_dump')
    this.activeChildren.delete('pg_restore')

    if (this.cancelled) return

    if (dumpExit !== 0) {
      throw new Error(`pg_dump exited with code ${dumpExit}.`)
    }

    if (restoreExit !== 0) {
      throw new Error(`pg_restore exited with code ${restoreExit}.`)
    }
  }

  private killActiveChildren(): void {
    for (const child of this.activeChildren.values()) {
      if (!child.killed) child.kill('SIGTERM')
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Migration cancelled.')
    }
  }

  private setPhase(phase: MigrationPhase): void {
    this.emit('phase', phase)
  }

  private log(message: string): void {
    this.emit('log', message)
  }

  private logToolOutput(tool: string, chunk: Buffer): void {
    chunk
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => this.log(`${tool}: ${line}`))
  }
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<number | null> {
  const [code] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null]
  return code
}

function serverMajor(serverVersionNum: number): number {
  if (serverVersionNum >= 100000) return Math.floor(serverVersionNum / 10000)
  return Math.floor(serverVersionNum / 10000)
}
