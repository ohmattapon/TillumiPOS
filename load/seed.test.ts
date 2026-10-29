// Runs against a throwaway pos_load_seed_test database on the local server named by LOAD_DB_ADMIN_URL,
// and skips when that is not set, so a plain `bun test ./load` never needs a database.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { randomBytes } from 'node:crypto'
import { baseSetupEnv, dropDatabase, migrateAndSeedBase, recreateDatabase, targetUrl } from './lib/database'
import { seedLoadData, type SeededData } from './seed'

const adminUrl = Bun.env.LOAD_DB_ADMIN_URL
const DB_NAME = 'pos_load_seed_test'
const SIZES = { products: 20, members: 10, pastSales: 50 }

if (!adminUrl) console.warn('seed.test.ts skipped: set LOAD_DB_ADMIN_URL to the admin connection of the local PostgreSQL server')

interface Snapshot {
  skus: string[]
  totalSum: number
}

async function freshSeed(): Promise<{ sql: SQL; seeded: SeededData; snapshot: Snapshot }> {
  await recreateDatabase(adminUrl!, DB_NAME)
  const databaseUrl = targetUrl(adminUrl!, DB_NAME)
  await migrateAndSeedBase(baseSetupEnv(databaseUrl, randomBytes(18).toString('base64url')))
  const sql = new SQL(databaseUrl)
  const seeded = await seedLoadData(sql, { ...SIZES, cashierPassword: randomBytes(12).toString('base64url'), cashierPin: '482913' })
  const skus = (await sql`select sku from products where id in ${sql(seeded.productIds.concat(seeded.hotProductIds))} order by sku`).map((row: { sku: string }) => row.sku)
  const [{ total }] = await sql`select coalesce(sum(total_satang), 0)::bigint as total from sales`
  return { sql, seeded, snapshot: { skus, totalSum: Number(total) } }
}

describe.skipIf(!adminUrl)('seedLoadData', () => {
  let sql: SQL
  let seeded: SeededData
  let first: Snapshot
  let second: Snapshot

  beforeAll(async () => {
    const run1 = await freshSeed()
    first = run1.snapshot
    await run1.sql.close()
    const run2 = await freshSeed()
    sql = run2.sql
    seeded = run2.seeded
    second = run2.snapshot
  }, 300_000)

  afterAll(async () => {
    await sql?.close()
    if (adminUrl) await dropDatabase(adminUrl, DB_NAME)
  })

  test('the counts match the sizes asked for', async () => {
    expect(seeded.productIds.length + seeded.hotProductIds.length).toBe(20)
    expect(seeded.memberIds).toHaveLength(10)
    expect(seeded.cashierUsernames).toHaveLength(20)
    expect(seeded.authUsers).toEqual(Array.from({ length: 10 }, (_, index) => `lockprobe${index + 1}`))
    expect(seeded.registerIds).toHaveLength(10)
    const [counts] = await sql`
      select (select count(*) from sales)::int as sales,
             (select count(*) from members)::int as members,
             (select count(*) from promotions)::int as promotions,
             (select count(*) from registers where id in ${sql(seeded.registerIds)})::int as registers`
    expect(counts).toEqual({ sales: 50, members: 10, promotions: 20, registers: 10 })
  })

  test('two runs on fresh databases give the same SKUs and the same sum of sales', () => {
    expect(second.skus).toEqual(first.skus)
    expect(second.totalSum).toBe(first.totalSum)
    expect(first.totalSum).toBeGreaterThan(0)
  })

  test('every past sale line has its allocated share, and the shares add up to the bill', async () => {
    const [{ missing }] = await sql`select count(*)::int as missing from sale_items where allocated_total_satang is null or allocated_vat_satang is null or category_id is null`
    expect(missing).toBe(0)
    const mismatched = await sql`
      select s.id from sales s join sale_items i on i.sale_id = s.id
      group by s.id, s.total_satang, s.vat_satang
      having sum(i.allocated_total_satang) <> s.total_satang or sum(i.allocated_vat_satang) <> s.vat_satang`
    expect(mismatched).toHaveLength(0)
  })

  test('receipt numbers are unique and the payments cover each bill', async () => {
    const [{ duplicates }] = await sql`select count(*) - count(distinct receipt_no) as duplicates from sales`
    expect(Number(duplicates)).toBe(0)
    const wrong = await sql`
      select s.id from sales s left join payments p on p.sale_id = s.id
      group by s.id, s.paid_satang, s.change_satang, s.total_satang
      having coalesce(sum(p.amount_satang), 0) <> s.paid_satang or s.paid_satang - s.change_satang <> s.total_satang`
    expect(wrong).toHaveLength(0)
  })

  test('products with packs and with tracked stock exist, and stock matches the ledger', async () => {
    const [{ packs, tracked }] = await sql`
      select (select count(*) from product_packs where product_id in ${sql(seeded.productIds)})::int as packs,
             (select count(*) from products where track_stock and id in ${sql(seeded.productIds)})::int as tracked`
    expect(packs).toBeGreaterThan(0)
    expect(tracked).toBeGreaterThan(0)
    const drift = await sql`
      select b.product_id from branch_stock b
      left join (select branch_id, product_id, sum(quantity) as total from stock_movements group by 1, 2) m using (branch_id, product_id)
      where coalesce(m.total, 0) <> b.qty or b.qty < 0`
    expect(drift).toHaveLength(0)
    const lastBalances = await sql`
      select distinct on (m.product_id) m.product_id, m.balance_after, b.qty from stock_movements m
      join branch_stock b using (branch_id, product_id) order by m.product_id, m.id desc`
    for (const row of lastBalances) expect(row.balance_after).toBe(row.qty)
  })

  test('hotProductIds are 5 tracked products with stock between 1 and 20', async () => {
    expect(seeded.hotProductIds).toHaveLength(5)
    const rows = await sql`
      select p.track_stock, coalesce(b.qty, 0) as qty from products p
      left join branch_stock b on b.product_id = p.id where p.id in ${sql(seeded.hotProductIds)}`
    expect(rows).toHaveLength(5)
    for (const row of rows) {
      expect(row.track_stock).toBe(true)
      expect(row.qty).toBeGreaterThanOrEqual(1)
      expect(row.qty).toBeLessThanOrEqual(20)
    }
  })

  test('member points match their ledger, and the coupon codes exist', async () => {
    const drift = await sql`
      select m.id from members m left join member_point_movements p on p.member_id = m.id
      group by m.id, m.points_balance having coalesce(sum(p.points), 0) <> m.points_balance`
    expect(drift).toHaveLength(0)
    expect(seeded.couponCodes.length).toBeGreaterThan(0)
    const found = await sql`select coupon_code from promotions where coupon_code in ${sql(seeded.couponCodes)}`
    expect(found).toHaveLength(seeded.couponCodes.length)
  })
})
