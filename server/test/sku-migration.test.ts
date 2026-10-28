import { expect, test } from 'bun:test'
import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MIGRATIONS_FOLDER } from '../src/infrastructure/database/migrations-folder'
import { assertTestDatabase } from './database'

test.each(['old-sku', 'main'] as const)('SKU migration upgrades %s without losing sequence or product data', async (source) => {
  assertTestDatabase()
  const target = new URL(Bun.env.DATABASE_URL!)
  const name = `pos_test_sku_migration_${crypto.randomUUID().replaceAll('-', '')}`
  target.pathname = '/postgres'
  const admin = new SQL(target.href)
  let connection: SQL | undefined
  let folder: string | undefined
  try {
    folder = await mkdtemp(join(tmpdir(), 'sku-migration-'))
    await mkdir(join(folder, 'meta'))
    const journal = JSON.parse(await readFile(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'))
    const entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= (source === 'old-sku' ? 22 : 26)) as { tag: string }[]
    for (const entry of entries) await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    await admin.unsafe(`create database "${name}"`)
    target.pathname = `/${name}`
    connection = new SQL(target.href)
    const database = drizzle(connection)
    await migrate(database, { migrationsFolder: folder })
    await connection`insert into products (sku, name, price_satang) values ('KEEP-1', 'Keep product', 1200)`
    if (source === 'old-sku') {
      await connection.unsafe('create sequence product_sku_number_seq maxvalue 2147483647')
      await connection`select setval('product_sku_number_seq', 80, true)`
      await connection`insert into drizzle.__drizzle_migrations (hash, created_at) values ('old-sku-checkout', 1792328900000)`
    } else {
      await connection`update products set product_type = 'cafe' where sku = 'KEEP-1'`
    }

    await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER })
    const [product] = await connection`select sku, name, price_satang, product_type from products where sku = 'KEEP-1'`
    expect(product).toEqual({ sku: 'KEEP-1', name: 'Keep product', price_satang: 1200, product_type: source === 'main' ? 'cafe' : 'normal' })
    const [column] = await connection`select column_name from information_schema.columns where table_name = 'modifier_options' and column_name = 'is_default'`
    expect(column?.column_name).toBe('is_default')
    const [next] = await connection`select nextval('product_sku_number_seq')::integer as number`
    expect(next?.number).toBe(source === 'old-sku' ? 81 : 1)

    // Replaying the repair must preserve a classification made after the upgrade.
    await connection`update products set product_type = 'cafe' where sku = 'KEEP-1'`
    const migration = await readFile(join(MIGRATIONS_FOLDER, '0027_auto_product_sku.sql'), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) await connection.unsafe(statement)
    expect((await connection`select product_type from products where sku = 'KEEP-1'`)[0]?.product_type).toBe('cafe')
    expect((await connection`select nextval('product_sku_number_seq')::integer as number`)[0]?.number).toBe(source === 'old-sku' ? 82 : 2)
  } finally {
    await connection?.close()
    await admin.unsafe(`drop database if exists "${name}"`)
    await admin.close()
    if (folder) await rm(folder, { recursive: true, force: true })
  }
}, 60_000)
