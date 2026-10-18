import { expect, test } from 'bun:test'
import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CAFE_MENU_ITEMS } from '../src/domains/cafe-menu.domain'
import { MIGRATIONS_FOLDER } from '../src/infrastructure/database/migrations-folder'
import { assertTestDatabase } from './database'

/**
 * Every case below creates, fully migrates and then drops its own private database. That takes a few
 * seconds on an idle machine but can pass Bun's 30 s default while a whole suite runs at the same
 * time, so the timeout is stated here instead of borrowing the default. No assertion depends on it.
 */
const MIGRATION_TEST_TIMEOUT_MS = 60_000

interface MigrationEntry {
  idx: number
  tag: string
  when: number
  version: string
  breakpoints: boolean
}

interface ProductSkuRow {
  sku: string
}

interface ClassifiedProductRow extends ProductSkuRow {
  product_type: 'normal' | 'cafe'
  [column: string]: unknown
}

async function withDisposableDatabase(run: (connection: SQL, oldMigrations: string) => Promise<void>) {
  assertTestDatabase()
  const target = new URL(Bun.env.DATABASE_URL!)
  const databaseName = `pos_test_product_type_${crypto.randomUUID().replaceAll('-', '')}`
  target.pathname = '/postgres'
  const admin = new SQL(target.href)
  let connection: SQL | undefined
  let folder: string | undefined
  const phases: Record<string, number> = {}
  let started = performance.now()
  try {
    // mkdtemp needs its parent to exist; CI runners do not pre-create it.
    await mkdir(join(tmpdir(), 'opencode'), { recursive: true })
    folder = await mkdtemp(join(tmpdir(), 'opencode', 'product-type-migration-'))
    await mkdir(join(folder, 'meta'))
    const journal = JSON.parse(await readFile(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'))
    const oldEntries = (journal.entries as MigrationEntry[]).filter((entry) => entry.idx <= 24)
    for (const entry of oldEntries) {
      await copyFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
    }
    const oldJournal = { ...journal, entries: oldEntries }
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify(oldJournal), 'utf8')
    await admin.unsafe(`create database "${databaseName}"`)
    target.pathname = `/${databaseName}`
    connection = new SQL(target.href)
    phases.create = performance.now() - started
    started = performance.now()
    await run(connection, folder)
    phases.exercise = performance.now() - started
  } finally {
    started = performance.now()
    await connection?.close()
    phases.close = performance.now() - started
    started = performance.now()
    await admin.unsafe(`drop database if exists "${databaseName}"`)
    phases.drop = performance.now() - started
    await admin.close()
    if (folder) await rm(folder, { recursive: true, force: true })
    console.info('product-type migration phases (ms)', phases)
  }
}

async function migrateFrom(connection: SQL, migrationsFolder = MIGRATIONS_FOLDER) {
  // This regression suite asserts the ledger of product-type migrations through
  // 0026. Later feature migrations must not change that accounting or be replayed.
  const folder = await mkdtemp(join(tmpdir(), 'product-type-scope-'))
  try {
    await mkdir(join(folder, 'meta'))
    const journal = JSON.parse(await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8'))
    const entries = (journal.entries as MigrationEntry[]).filter(entry => entry.idx <= 26)
    for (const entry of entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
    await writeFile(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
    await migrate(drizzle(connection), { migrationsFolder: folder })
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

test('fresh install gives products a normal default, cafe support, NOT NULL and allowed-values constraint', async () => {
  await withDisposableDatabase(async (connection) => {
    await migrateFrom(connection)
    const inserted = await connection`insert into products (sku, name, price_satang) values ('fresh', 'fresh', 100) returning product_type`
    expect(inserted[0]?.product_type).toBe('normal')
    await connection`update products set product_type = 'cafe' where sku = 'fresh'`
    const invalidType = Promise.resolve(connection`update products set product_type = 'other' where sku = 'fresh'`)
    await expect(invalidType).rejects.toThrow()
    const nullType = Promise.resolve(connection`update products set product_type = null where sku = 'fresh'`)
    await expect(nullType).rejects.toThrow()
    const columns = await connection`select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'product_type'`
    expect(columns[0]?.is_nullable).toBe('NO')
    expect(columns[0]?.column_default).toContain('normal')
  })
}, MIGRATION_TEST_TIMEOUT_MS)

test('upgrade backfills only the exact 20 starter SKUs with matching applied audit, preserves data and manual classification on rerun', async () => {
  await withDisposableDatabase(async (connection, oldMigrations) => {
    await migrateFrom(connection, oldMigrations)
    const absent = await connection`select 1 from information_schema.columns where table_name = 'products' and column_name = 'product_type'`
    expect(absent).toHaveLength(0)
    expect(CAFE_MENU_ITEMS).toHaveLength(20)
    for (const item of CAFE_MENU_ITEMS) {
      await connection`insert into products (sku, name, price_satang, cost_satang, track_stock) values (${item.key}, ${item.name}, 12345, 4321, true)`
    }
    const extraSkus = ['ordinary', 'CAFE-CUSTOM', 'RENAMED-STARTER', 'cafe-ame-hot']
    for (const sku of extraSkus) {
      await connection`insert into products (sku, name, price_satang) values (${sku}, 'อเมริกาโน่ร้อน', 500)`
    }
    // Historical audit names the original SKU; renaming the product is deliberately not inferred.
    await connection`update products set sku = 'RENAMED-COCOA' where sku = 'CAFE-COC-ICE'`
    const auditedSkus = CAFE_MENU_ITEMS.filter((item) => item.key !== 'CAFE-COC-HOT').map((item) => item.key)
    const auditAfter = JSON.stringify({ addedProducts: [...auditedSkus, ...extraSkus] })
    await connection`insert into audit_logs (actor_name, action, entity_type, entity_id, summary, "after") values ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'applied', ${auditAfter}::text::jsonb)`
    const evidence = await connection`select jsonb_typeof("after" -> 'addedProducts') as kind from audit_logs`
    expect(evidence[0]?.kind).toBe('array')
    // Wrong action, wrong property and non-array values must not count as provenance.
    await connection`insert into audit_logs (actor_name, action, entity_type, entity_id, summary, "after") values
      ('owner', 'product.created', 'product', '1', 'wrong action', '{"addedProducts":["CAFE-COC-HOT"]}'),
      ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'wrong property', '{"skippedProducts":["CAFE-COC-HOT"]}'),
      ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'not array', '{"addedProducts":"CAFE-COC-HOT"}')`
    await connection`insert into branch_stock (branch_id, product_id, qty) select b.id, p.id, 37 from branches b cross join products p where b.code = 'MAIN'`
    await connection`insert into modifier_groups (name) values ('preserved group')`
    await connection`insert into modifier_options (group_id, name, price_satang, cost_satang, is_default) select id, 'preserved option', 1500, 500, true from modifier_groups`
    await connection`insert into product_modifier_groups (product_id, group_id) select p.id, g.id from products p cross join modifier_groups g`
    const productsBefore = await connection`select * from products order by id`
    const stockBefore = await connection`select * from branch_stock order by product_id`
    const optionsBefore = await connection`select * from modifier_options order by id`
    const groupsBefore = await connection`select * from product_modifier_groups order by product_id`
    const auditBefore = await connection`select * from audit_logs order by id`

    await migrateFrom(connection)
    const productsAfter: ClassifiedProductRow[] = await connection`select * from products order by id`
    const classified = productsAfter.filter((row) => row.product_type === 'cafe').map((row) => row.sku).sort()
    const expected = auditedSkus.filter((sku) => sku !== 'CAFE-COC-ICE').sort()
    expect(classified).toEqual(expected)
    const withoutType = productsAfter.map(({ product_type: _type, ...row }) => row)
    expect(withoutType).toEqual([...productsBefore])
    expect([...(await connection`select * from branch_stock order by product_id`)]).toEqual([...stockBefore])
    expect([...(await connection`select * from modifier_options order by id`)]).toEqual([...optionsBefore])
    expect([...(await connection`select * from product_modifier_groups order by product_id`)]).toEqual([...groupsBefore])
    expect([...(await connection`select * from audit_logs order by id`)]).toEqual([...auditBefore])

    await connection`update products set product_type = 'normal' where sku = 'CAFE-AME-HOT'`
    const ledgerBefore = await connection`select * from drizzle.__drizzle_migrations order by id`
    await migrateFrom(connection)
    const manual = await connection`select product_type from products where sku = 'CAFE-AME-HOT'`
    expect(manual[0]?.product_type).toBe('normal')
    expect([...(await connection`select * from drizzle.__drizzle_migrations order by id`)]).toEqual([...ledgerBefore])
  })
}, MIGRATION_TEST_TIMEOUT_MS)

test('missing modifier_options.is_default fails preflight explicitly without repairing schema or forging ledger', async () => {
  await withDisposableDatabase(async (connection, oldMigrations) => {
    await migrateFrom(connection, oldMigrations)
    // Reproduce an advanced checkout ledger whose schema skipped its prerequisite.
    await connection`alter table modifier_options drop column is_default`
    const ledgerBefore = await connection`select * from drizzle.__drizzle_migrations order by id`
    let failure: unknown
    try {
      await migrateFrom(connection)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeDefined()
    const messages: string[] = []
    for (let error = failure; error instanceof Error; error = error.cause) messages.push(error.message)
    expect(messages.join('\n')).toContain('PRODUCT_TYPE_MIGRATION_REQUIRES_MODIFIER_OPTIONS_IS_DEFAULT')
    const columns = await connection`select column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'products' and column_name = 'product_type') or (table_name = 'modifier_options' and column_name = 'is_default'))`
    expect(columns).toHaveLength(0)
    expect([...(await connection`select * from drizzle.__drizzle_migrations order by id`)]).toEqual([...ledgerBefore])
  })
}, MIGRATION_TEST_TIMEOUT_MS)

test('every one of the 20 frozen starter SKUs is eligible when applied audit evidence exists', async () => {
  await withDisposableDatabase(async (connection, oldMigrations) => {
    await migrateFrom(connection, oldMigrations)
    for (const item of CAFE_MENU_ITEMS) {
      await connection`insert into products (sku, name, price_satang) values (${item.key}, ${item.name}, 100)`
    }
    const auditAfter = JSON.stringify({ addedProducts: CAFE_MENU_ITEMS.map((item) => item.key) })
    await connection`insert into audit_logs (actor_name, action, entity_type, entity_id, summary, "after") values ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'applied', ${auditAfter}::text::jsonb)`
    await migrateFrom(connection)
    const classified: ProductSkuRow[] = await connection`select sku from products where product_type = 'cafe' order by sku`
    expect(classified.map((row) => row.sku)).toEqual(CAFE_MENU_ITEMS.map((item) => item.key).sort())
  })
}, MIGRATION_TEST_TIMEOUT_MS)

test('repairs the product type column lost to an advanced ledger and keeps a later manual classification on rerun', async () => {
  await withDisposableDatabase(async (connection, oldMigrations) => {
    await migrateFrom(connection, oldMigrations)
    const absent = await connection`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'product_type'`
    expect(absent).toHaveLength(0)
    for (const item of CAFE_MENU_ITEMS) {
      await connection`insert into products (sku, name, price_satang, cost_satang, track_stock) values (${item.key}, ${item.name}, 12345, 4321, true)`
    }
    await connection`insert into products (sku, name, price_satang) values ('ordinary', 'ordinary', 500)`
    // CAFE-COC-HOT stays unclassified: the frozen list alone is not evidence, only the applied audit is.
    const auditedSkus = CAFE_MENU_ITEMS.map((item) => item.key).filter((sku) => sku !== 'CAFE-COC-HOT')
    const auditAfter = JSON.stringify({ addedProducts: auditedSkus })
    await connection`insert into audit_logs (actor_name, action, entity_type, entity_id, summary, "after") values ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'applied', ${auditAfter}::text::jsonb)`
    await connection`insert into branch_stock (branch_id, product_id, qty) select b.id, p.id, 37 from branches b cross join products p where b.code = 'MAIN'`
    const productsBefore = await connection`select * from products order by id`
    const stockBefore = await connection`select * from branch_stock order by product_id`
    // Another checkout on the shared server advanced the ledger past 0025, so the migrator skips 0025.
    await connection`insert into drizzle.__drizzle_migrations (hash, created_at) values ('other-checkout', 1792328800003)`

    await migrateFrom(connection)

    const columns = await connection`select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'product_type'`
    expect(columns[0]?.data_type).toBe('text')
    expect(columns[0]?.is_nullable).toBe('NO')
    expect(columns[0]?.column_default).toContain('normal')
    const constraints = await connection`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_product_type_allowed'`
    expect(constraints).toHaveLength(1)
    expect(constraints[0]?.definition).toContain("'normal'")
    expect(constraints[0]?.definition).toContain("'cafe'")

    const productsAfter: ClassifiedProductRow[] = await connection`select * from products order by id`
    const classified = productsAfter.filter((row) => row.product_type === 'cafe').map((row) => row.sku).sort()
    expect(classified).toEqual([...auditedSkus].sort())
    const withoutType = productsAfter.map(({ product_type: _type, ...row }) => row)
    expect(withoutType).toEqual([...productsBefore])
    expect([...(await connection`select * from branch_stock order by product_id`)]).toEqual([...stockBefore])

    // A later change of classification must survive the repair running a second time.
    await connection`update products set product_type = 'normal' where sku = 'CAFE-AME-HOT'`
    await connection`update products set product_type = 'cafe' where sku = 'ordinary'`
    const rerunProducts = await connection`select * from products order by id`
    const rerunStock = await connection`select * from branch_stock order by product_id`
    await connection`delete from drizzle.__drizzle_migrations where created_at > 1792328800003`
    await migrateFrom(connection)

    expect([...(await connection`select * from products order by id`)]).toEqual([...rerunProducts])
    expect([...(await connection`select * from branch_stock order by product_id`)]).toEqual([...rerunStock])
    const manual = await connection`select product_type from products where sku = 'CAFE-AME-HOT'`
    expect(manual[0]?.product_type).toBe('normal')
    const classifiedOutsideStarter = await connection`select product_type from products where sku = 'ordinary'`
    expect(classifiedOutsideStarter[0]?.product_type).toBe('cafe')
    const constraintCount = await connection`select count(*)::int as count from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_product_type_allowed'`
    expect(constraintCount[0]?.count).toBe(1)
    // The repair recorded itself once, so the second run re-executed the SQL instead of being skipped.
    const recorded = await connection`select count(*)::int as count from drizzle.__drizzle_migrations where created_at > 1792328800003`
    expect(recorded[0]?.count).toBe(1)
  })
}, MIGRATION_TEST_TIMEOUT_MS)

test('reruns the merged journal cleanly over a pre-merge ledger whose columns and classification already exist', async () => {
  await withDisposableDatabase(async (connection) => {
    // The owner's database was stamped by a pre-merge checkout: its ledger stops at 0023's timestamp even
    // though that checkout's own numbering had already created modifier_options.is_default and
    // products.product_type and classified the menu. Rerunning the merged journal must finish rather than
    // fail on the renumbered column, and must not reclassify a menu the owner already classified.
    await migrateFrom(connection)
    for (const item of CAFE_MENU_ITEMS) {
      await connection`insert into products (sku, name, price_satang) values (${item.key}, ${item.name}, 100)`
    }
    const auditAfter = JSON.stringify({ addedProducts: CAFE_MENU_ITEMS.map((item) => item.key) })
    await connection`insert into audit_logs (actor_name, action, entity_type, entity_id, summary, "after") values ('owner', 'cafe_menu.applied', 'cafe_menu', 'starter', 'applied', ${auditAfter}::text::jsonb)`
    await connection`update products set product_type = 'cafe' where sku = 'CAFE-ESP-HOT'`
    await connection`delete from drizzle.__drizzle_migrations where created_at > 1792328800001`
    const rewound = await connection`select id from drizzle.__drizzle_migrations where created_at > 1792328800001`
    expect(rewound).toHaveLength(0)

    await migrateFrom(connection)

    const columns = await connection`select data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'product_type'`
    expect(columns[0]?.data_type).toBe('text')
    expect(columns[0]?.is_nullable).toBe('NO')
    expect(columns[0]?.column_default).toContain('normal')
    const constraints = await connection`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_product_type_allowed'`
    expect(constraints).toHaveLength(1)
    expect(constraints[0]?.definition).toContain("'normal'")
    expect(constraints[0]?.definition).toContain("'cafe'")
    const optionColumn = await connection`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'modifier_options' and column_name = 'is_default'`
    expect(optionColumn).toHaveLength(1)

    // The whole merged journal ran: 0024, 0025 and 0026 recorded themselves.
    const finished = await connection`select count(*)::int as count from drizzle.__drizzle_migrations where created_at > 1792328800001`
    expect(finished[0]?.count).toBe(3)

    const classified: ProductSkuRow[] = await connection`select sku from products where product_type = 'cafe' order by sku`
    expect(classified.map((row) => row.sku)).toEqual(['CAFE-ESP-HOT'])
  })
}, MIGRATION_TEST_TIMEOUT_MS)
