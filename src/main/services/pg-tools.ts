import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface PgTools {
  dump: string
  restore: string
  dumpVersion: string
  restoreVersion: string
}

export async function resolvePgTools(minServerMajor: number): Promise<PgTools> {
  const dumpVersion = await readToolVersion('pg_dump')
  const restoreVersion = await readToolVersion('pg_restore')

  ensureToolSupportsServer('pg_dump', dumpVersion, minServerMajor)
  ensureToolSupportsServer('pg_restore', restoreVersion, minServerMajor)

  return {
    dump: 'pg_dump',
    restore: 'pg_restore',
    dumpVersion,
    restoreVersion
  }
}

function ensureToolSupportsServer(tool: string, version: string, minServerMajor: number): void {
  const toolMajor = parseMajorVersion(version)

  if (toolMajor < minServerMajor) {
    throw new Error(
      `${tool} ${version} is too old. Install PostgreSQL client tools ${minServerMajor} or newer.`
    )
  }
}

async function readToolVersion(tool: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(tool, ['--version'])
    const output = `${stdout}${stderr}`.trim()
    return output || `${tool} version unknown`
  } catch {
    throw new Error(
      `${tool} was not found. Install PostgreSQL client tools and make sure ${tool} is on PATH.`
    )
  }
}

function parseMajorVersion(version: string): number {
  const match = version.match(/(\d+)(?:\.\d+)?/)

  if (!match) {
    throw new Error(`Could not read PostgreSQL tool version from: ${version}`)
  }

  return Number(match[1])
}
