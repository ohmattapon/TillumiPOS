import { SQL } from 'bun'

/** Refuse every URL except the exact local test target. */
export function assertTestDatabase(): string {
  const target = new URL(Bun.env.DATABASE_URL ?? 'postgres://unset/')
  const name = decodeURIComponent(target.pathname.slice(1))
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== 'localhost' ||
      target.port !== '5433' || name !== 'pos_test' || target.search || target.hash)
    throw new Error(`Refusing to run tests against database "${name}": expected pos_test on localhost:5433`)
  return name
}

/** Inspect the cached connection itself; mutable env cannot mask its actual database. */
export async function assertConnectedTestDatabase(connection: SQL): Promise<void> {
  assertTestDatabase()
  const [actual] = await connection`select current_database() as name`
  if (actual?.name !== 'pos_test')
    throw new Error(`Refusing to reset connected database "${actual?.name}"`)
}

/** Creates the test database on first use. */
export async function ensureTestDatabase(adminFactory = (url: string) => new SQL(url)): Promise<void> {
  const name = assertTestDatabase()
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
