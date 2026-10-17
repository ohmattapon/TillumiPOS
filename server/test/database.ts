import { SQL } from 'bun'

/**
 * The guard is strict by default: only the local test database may be used. The owner may name one
 * remote throwaway database instead, as `TEST_DATABASE_ALLOW=<host>/<database>`, set in the command
 * that runs the tests. It is never read from a file, so a committed file cannot point the suite at a
 * remote server.
 */
const ALLOW_ENV = 'TEST_DATABASE_ALLOW'

function targetOf(url: string) {
  const target = new URL(url)
  return { target, name: decodeURIComponent(target.pathname.slice(1)) }
}

function isLocalTestTarget(target: URL, name: string) {
  return target.hostname === 'localhost' && target.port === '5433' && name === 'pos_test' && !target.search && !target.hash
}

function isAllowedRemote(target: URL, name: string) {
  return Bun.env[ALLOW_ENV] === `${target.hostname}/${name}`
}

/** Returns the database name if the configured target may be used by the suite, and throws otherwise. */
export function assertTestDatabase(): string {
  const { target, name } = targetOf(Bun.env.DATABASE_URL ?? 'postgres://unset/')
  const protocolOk = ['postgres:', 'postgresql:'].includes(target.protocol)
  if (protocolOk && (isLocalTestTarget(target, name) || isAllowedRemote(target, name))) return name
  throw new Error(`Refusing to run tests against database "${name}": expected pos_test on localhost:5433`)
}

/** Inspect the cached connection itself; mutable env cannot mask its actual database. */
export async function assertConnectedTestDatabase(connection: SQL): Promise<void> {
  const expected = assertTestDatabase()
  const [actual] = await connection`select current_database() as name`
  if (actual?.name !== expected)
    throw new Error(`Refusing to reset connected database "${actual?.name}"`)
}

/** Creates the local test database on first use. A named remote database already exists and is not touched. */
export async function ensureTestDatabase(adminFactory = (url: string) => new SQL(url)): Promise<void> {
  const name = assertTestDatabase()
  const { target } = targetOf(Bun.env.DATABASE_URL!)
  if (!isLocalTestTarget(target, name)) return

  const adminUrl = new URL(Bun.env.DATABASE_URL!)
  adminUrl.pathname = '/postgres'

  const admin = adminFactory(adminUrl.href)
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`
    // CREATE DATABASE cannot take a bound parameter; the name was validated above.
    if (existing.length === 0) await admin.unsafe(`create database "${name}"`)
  } catch (cause) {
    throw new Error(
      `Cannot reach PostgreSQL at ${adminUrl.host}. Start it with "bun run db:up" from the repo root.`,
      { cause },
    )
  } finally {
    await admin.close()
  }
}
