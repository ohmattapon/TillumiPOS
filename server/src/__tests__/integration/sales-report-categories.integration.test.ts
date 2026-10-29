import { beforeEach, expect, test } from 'bun:test'
import { resetDatabase, signIn, seedProduct, ok, type Session } from '../../../test/harness'
import { client as sql } from '../../libs/db'
import { assertConnectedTestDatabase } from '../../../test/database'

let owner: Session
const range = { from: '2026-01-02', to: '2026-01-02' }
beforeEach(async () => {
  await resetDatabase()
  await assertConnectedTestDatabase(sql)
  owner = await signIn()
})
async function sell(by: Session, productId: number, quantity = 1) {
  const bill = ok(await by.api.sales.post({ items: [{ productId, quantity }], payments: [{ method: 'cash', amountSatang: 100000 }] }))
  await sql`update sales set created_at = ${new Date('2026-01-02T03:00:00Z')} where id = ${bill.id}`
  return bill
}
test('a product with no category and a product in a deleted category both appear, and net sales add up to the overview', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const gone = ok(await owner.api.catalog.categories.post({ name: 'หมวดที่ถูกลบ' }))
  const tea = await seedProduct(owner, { categoryId: drinks.id, priceSatang: 5000, costSatang: 2000, stock: 10 })
  const old = await seedProduct(owner, { categoryId: gone.id, priceSatang: 3000, costSatang: 1000, stock: 10 })
  const plain = await seedProduct(owner, { priceSatang: 1000, costSatang: 400, stock: 10 })
  await sell(owner, tea.id, 2)
  await sell(owner, old.id)
  await sell(owner, plain.id)
  // Nothing references a sold line's category, so deleting the category leaves the line's id behind.
  await sql`delete from categories where id = ${gone.id}`
  const report = ok(await owner.api.sales.reports.categories.get({ query: range }))
  expect(report.total).toBe(3)
  expect(report.items.map((row) => [row.categoryId, row.name])).toEqual([[drinks.id, 'เครื่องดื่ม'], [gone.id, null], [null, null]])
  const overview = ok(await owner.api.sales.reports.get({ query: range })).summary
  expect(report.items.reduce((sum, row) => sum + row.netSalesSatang, 0)).toBe(overview.netSalesSatang)
  expect(report.items.reduce((sum, row) => sum + row.costSatang, 0)).toBe(overview.costSatang)
  for (const row of report.items) expect(row.profitSatang).toBe(row.netSalesSatang - row.costSatang)
  expect(report.items.reduce((sum, row) => sum + row.shareBp, 0)).toBeLessThanOrEqual(10000)
  expect(report.items[0]?.shareBp).toBe(Math.floor((report.items[0]!.netSalesSatang * 10000) / overview.netSalesSatang))
})
test('the totals equal the sum of every category, match the overview, ignore paging and follow the cashier filter', async () => {
  const a = ok(await owner.api.catalog.categories.post({ name: 'ก' }))
  const b = ok(await owner.api.catalog.categories.post({ name: 'ข' }))
  const cashier = await signIn('cashier')
  const pa = await seedProduct(owner, { categoryId: a.id, priceSatang: 1000, costSatang: 300, stock: 5 })
  const pb = await seedProduct(owner, { categoryId: b.id, priceSatang: 2000, costSatang: 500, stock: 5 })
  const plain = await seedProduct(owner, { priceSatang: 700, costSatang: 200, stock: 5 })
  await sell(owner, pa.id, 2)
  await sell(owner, pb.id)
  await sell(cashier, plain.id)
  const whole = ok(await owner.api.sales.reports.categories.get({ query: { ...range, limit: 500 } }))
  const sum = (key: 'quantity' | 'netSalesSatang' | 'costSatang' | 'profitSatang', rows = whole.items) => rows.reduce((n, row) => n + row[key], 0)
  expect(whole.total).toBe(3)
  expect(whole.totals).toEqual({ quantity: sum('quantity'), netSalesSatang: sum('netSalesSatang'), costSatang: sum('costSatang'), profitSatang: sum('profitSatang') })
  const summary = ok(await owner.api.sales.reports.get({ query: range })).summary
  expect(whole.totals).toMatchObject({ netSalesSatang: summary.netSalesSatang, costSatang: summary.costSatang, profitSatang: summary.profitSatang })
  const paged = ok(await owner.api.sales.reports.categories.get({ query: { ...range, limit: 1 } }))
  expect(paged.items).toHaveLength(1)
  expect(paged.totals).toEqual(whole.totals)
  const byCashier = ok(await owner.api.sales.reports.categories.get({ query: { ...range, cashierId: cashier.user.id } }))
  expect(byCashier.totals.quantity).toBe(1)
  expect(byCashier.totals.costSatang).toBe(200)
  expect(ok(await owner.api.sales.reports.categories.get({ query: { from: '2026-02-01', to: '2026-02-01' } })).totals)
    .toEqual({ quantity: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0 })
})
test('a line keeps the category it was sold with when the product moves to another category', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const snacks = ok(await owner.api.catalog.categories.post({ name: 'ขนม' }))
  const tea = await seedProduct(owner, { categoryId: drinks.id, stock: 5 })
  await sell(owner, tea.id)
  ok(await owner.api.catalog.products({ id: tea.id }).patch({ categoryId: snacks.id }))
  const report = ok(await owner.api.sales.reports.categories.get({ query: range }))
  expect(report.items.map((row) => row.categoryId)).toEqual([drinks.id])
})
test('categories sort by net sales then id, page with a stable order, and refuse a cashier', async () => {
  const a = ok(await owner.api.catalog.categories.post({ name: 'ก' }))
  const b = ok(await owner.api.catalog.categories.post({ name: 'ข' }))
  const pa = await seedProduct(owner, { categoryId: a.id, priceSatang: 1000, stock: 5 })
  const pb = await seedProduct(owner, { categoryId: b.id, priceSatang: 1000, stock: 5 })
  const plain = await seedProduct(owner, { priceSatang: 1000, stock: 5 })
  await sell(owner, plain.id)
  await sell(owner, pb.id)
  await sell(owner, pa.id)
  const ids = async (extra: Record<string, number> = {}) =>
    ok(await owner.api.sales.reports.categories.get({ query: { ...range, ...extra } })).items.map((row) => row.categoryId)
  expect(await ids()).toEqual([a.id, b.id, null])
  expect(await ids({ limit: 1, offset: 1 })).toEqual([b.id])
  const cashier = await signIn('cashier')
  expect(Number((await cashier.api.sales.reports.categories.get({ query: range })).error?.status)).toBe(403)
})
