import type { ClientConfig } from 'pg'

export interface ParsedConnection {
  database: string
  clientConfig: ClientConfig
  env: NodeJS.ProcessEnv
}

export function parsePostgresConnection(connectionString: string): ParsedConnection {
  let url: URL

  try {
    url = new URL(connectionString)
  } catch {
    throw new Error('Enter a valid PostgreSQL connection string.')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Connection strings must start with postgres:// or postgresql://.')
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))

  if (!database) {
    throw new Error('Connection string must include a database name.')
  }

  const sslmode = url.searchParams.get('sslmode')
  const usesSsl = sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full'

  const clientConfig: ClientConfig = {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ssl: usesSsl ? { rejectUnauthorized: sslmode === 'verify-full' } : undefined
  }

  const env: NodeJS.ProcessEnv = {
    PGHOST: url.hostname,
    PGDATABASE: database
  }

  if (url.port) env.PGPORT = url.port
  if (url.username) env.PGUSER = decodeURIComponent(url.username)
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password)
  if (sslmode) env.PGSSLMODE = sslmode

  return { database, clientConfig, env }
}

export function assertSafeIdentifier(identifier: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(identifier)) {
    throw new Error(
      'Target database name must start with a letter or underscore and contain only letters, numbers, underscores, or dollar signs.'
    )
  }
}
