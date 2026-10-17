import { expect, test } from 'bun:test'
import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { MIGRATIONS_FOLDER } from '../src/infrastructure/database/migrations-folder'
import { assertTestDatabase } from './database'

test('repairs a skipped option-default migration without replacing existing options, and can run twice', async () => {
  assertTestDatabase()
  const target = new URL(Bun.env.DATABASE_URL!)
  const databaseName = `pos_test_cafe_migration_${crypto.randomUUID().replaceAll('-', '')}`
  target.pathname = '/postgres'
  const admin = new SQL(target.href)
  let connection: SQL | undefined
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    target.pathname = `/${databaseName}`
    connection = new SQL(target.href)
    const database = drizzle(connection)
    const migrationOptions = { migrationsFolder: MIGRATIONS_FOLDER }
    await migrate(database, migrationOptions)
    await connection`alter table modifier_options drop column is_default`
    await connection`insert into modifier_groups (name) values ('existing group')`
    await connection`insert into modifier_options (group_id, name, price_satang) values (1, 'existing option', 1500)`
    // A different checkout already advanced the shared database beyond cafe migration 0020.
    await connection`insert into drizzle.__drizzle_migrations (hash, created_at) values ('other-checkout', 1792242300000)`
    // Keep only the old ledger to reproduce a database where the repair has not run yet.
    await connection`delete from drizzle.__drizzle_migrations where created_at > 1792242300000`

    await migrate(database, migrationOptions)
    const options = await connection`select name, price_satang, is_default from modifier_options`
    const existingOption = { name: 'existing option', price_satang: 1500, is_default: false }
    expect([...options]).toEqual([existingOption])

    await connection`update modifier_options set is_default = true where id = 1`
    // Also exercise the SQL when the column already exists, not merely the migrator's skip path.
    await connection`delete from drizzle.__drizzle_migrations where created_at > 1792242300000`
    await migrate(database, migrationOptions)
    const preserved = await connection`select is_default from modifier_options where id = 1`
    expect(preserved[0]?.is_default).toBe(true)
  } finally {
    await connection?.close()
    await admin.unsafe(`drop database if exists "${databaseName}"`)
    await admin.close()
  }
}, 30000)
