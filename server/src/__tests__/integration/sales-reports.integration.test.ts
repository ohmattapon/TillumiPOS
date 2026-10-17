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
async function sell(by: Session, productId: number) {
  return ok(await by.api.sales.post({ items: [{ productId, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 100000 }] }))
}
async function dateSale(id: number, date: string) {
  await sql`update sales set created_at = ${new Date(date)} where id = ${id}`
}
test('totals do not multiply across lines; VAT, discounts, change and voids reconcile', async () => {
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1500, stock: 10 })
  const cake = await seedProduct(owner, { priceSatang: 4000, costSatang: 2000, stock: 10 })
  const sale = ok(await owner.api.sales.post({
    items: [{ productId: tea.id, quantity: 2 }, { productId: cake.id, quantity: 1 }],
    discountSatang: 500, payments: [{ method: 'cash', amountSatang: 10000 }],
  }))
  const voided = await sell(owner, tea.id)
  ok(await owner.api.sales({ id: voided.id }).void.post({ reason: 'ผิดรายการ' }))
  await dateSale(sale.id, '2026-01-02T03:00:00Z')
  await dateSale(voided.id, '2026-01-02T04:00:00Z')
  await sql`update products set name = 'ชื่อใหม่', cost_satang = 9999 where id = ${tea.id}`
  const report = ok(await owner.api.sales.reports.get({ query: range }))
  expect(report.summary).toEqual({
    saleCount: 1, voidedCount: 1, totalSatang: 8500, vatSatang: 556, discountSatang: 500,
    costSatang: 5000, netSalesSatang: 7944, profitSatang: 2944,
  })
  expect(report.byMethod.reduce((sum, p) => sum + p.amountSatang, 0)).toBe(8500)
  expect(report.days.items[0]?.totalSatang).toBe(8500)
  const first = ok(await owner.api.sales.reports.products.get({ query: { ...range, limit: 1 } }))
  expect(first.total).toBe(2)
  expect(first.items[0]).toMatchObject({ productId: tea.id, productName: tea.name, quantity: 2, lineTotalSatang: 5000 })
  expect(ok(await owner.api.sales.reports.products.get({ query: { ...range, limit: 1, offset: 20 } }))).toEqual({ items: [], total: 2 })
})
test('inclusive local dates respect midnight boundaries and fill zero-sales days', async () => {
  const p = await seedProduct(owner, { stock: 20 })
  for (const date of ['2026-01-01T16:59:59Z', '2026-01-01T17:00:00Z', '2026-01-02T16:59:59Z', '2026-01-02T17:00:00Z'])
    await dateSale((await sell(owner, p.id)).id, date)
  expect(ok(await owner.api.sales.reports.get({ query: range })).summary.saleCount).toBe(2)
  const days = ok(await owner.api.sales.reports.get({ query: { from: '2026-01-02', to: '2026-01-04' } }))
  expect(days.days.items.map((r) => [new Date(r.day).toISOString().slice(0, 10), r.saleCount])).toEqual([['2026-01-02', 2], ['2026-01-03', 1], ['2026-01-04', 0]])
})
test('cashiers cannot access any report, whichever scope they ask for', async () => {
  const cashier = await signIn('cashier')
  for (const result of [
    await cashier.api.sales.reports.get({ query: { ...range, scope: 'all' } }),
    await cashier.api.sales.reports.products.get({ query: range }),
    await cashier.api.sales.reports.branches.get({ query: range }),
  ]) expect(Number(result.error?.status)).toBe(403)
})
test('DST day boundaries follow the shop zone instead of a fixed 24-hour interval', async () => {
  ok(await owner.api.settings.patch({ timeZone: 'America/New_York' }))
  const p = await seedProduct(owner, { stock: 10 })
  for (const date of ['2026-03-08T05:00:00Z', '2026-03-09T03:59:59Z', '2026-03-09T04:00:00Z'])
    await dateSale((await sell(owner, p.id)).id, date)
  const result = ok(await owner.api.sales.reports.get({ query: { from: '2026-03-08', to: '2026-03-08' } }))
  expect(result.timeZone).toBe('America/New_York')
  expect(result.summary.saleCount).toBe(2)
})
