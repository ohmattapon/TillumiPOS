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
test('sums bills, discount and net sales per promotion and leaves out voided bills', async () => {
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1000, stock: 40 })
  const bundle = ok(await owner.api.promotions.post({
    name: 'ซื้อ 2 แถม 1', kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1,
    scope: { productIds: [tea.id], categoryIds: [] },
  }))
  const coupon = ok(await owner.api.promotions.post({ name: 'คูปองลด 10%', kind: 'percent', value: 1000, couponCode: 'SUMMER10' }))
  const sellWithQuote = async (quantity: number, couponCode?: string) => {
    const quote = ok(await owner.api.quotes.post({
      lines: [{ productId: tea.id, quantity }], ...(couponCode === undefined ? {} : { couponCode }),
    }))
    return ok(await owner.api.sales.post({
      items: [{ productId: tea.id, quantity }],
      payments: [{ method: 'cash' as const, amountSatang: quote.totalSatang }],
      quoteId: quote.id,
    }))
  }
  const bundled = await sellWithQuote(3)
  expect(bundled.promotion?.id).toBe(bundle.id)
  const couponed = await sellWithQuote(2, 'summer10')
  expect(couponed.promotion?.id).toBe(coupon.id)
  const cancelled = await sellWithQuote(2, 'SUMMER10')
  ok(await owner.api.sales({ id: cancelled.id }).void.post({ reason: 'ผิดรายการ' }))
  for (const sale of [bundled, couponed, cancelled]) await dateSale(sale.id, '2026-01-02T03:00:00Z')

  const report = ok(await owner.api.sales.reports.promotions.get({ query: range }))
  expect(report.total).toBe(2)
  expect(report.items).toEqual([
    {
      promotionId: bundle.id, name: 'ซื้อ 2 แถม 1', bills: 1,
      discountSatang: bundled.discountSatang, netSalesSatang: bundled.totalSatang - bundled.vatSatang,
    },
    {
      promotionId: coupon.id, name: 'คูปองลด 10%', bills: 1,
      discountSatang: couponed.discountSatang, netSalesSatang: couponed.totalSatang - couponed.vatSatang,
    },
  ])
  // Editing the promotion afterwards changes nothing about the bills already sold under it.
  ok(await owner.api.promotions({ id: coupon.id }).patch({ name: 'คูปองใหม่' }))
  const renamed = ok(await owner.api.sales.reports.promotions.get({ query: range }))
  expect(renamed.items.map((row) => row.name)).toEqual(['ซื้อ 2 แถม 1', 'คูปองลด 10%'])
  expect(ok(await owner.api.sales.reports.promotions.get({ query: { ...range, limit: 1 } })))
    .toMatchObject({ total: 2, items: [{ promotionId: bundle.id }] })
})
test('filters every report by cashier and by member or guest, and lists the cashiers', async () => {
  const cashier = await signIn('cashier')
  const p = await seedProduct(owner, { stock: 20 })
  const member = ok(await owner.api.members.post({ name: 'สมาชิกรายงาน', phone: '0812345678' }))
  const bills = [
    await sell(owner, p.id),
    ok(await owner.api.sales.post({
      memberId: member.id, items: [{ productId: p.id, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 100000 }],
    })),
    await sell(cashier, p.id),
  ]
  for (const bill of bills) await dateSale(bill.id, '2026-01-02T03:00:00Z')
  const count = async (query: Record<string, string | number>) =>
    ok(await owner.api.sales.reports.get({ query: { ...range, ...query } })).summary.saleCount
  expect(await count({})).toBe(3)
  expect(await count({ cashierId: owner.user.id })).toBe(2)
  expect(await count({ cashierId: cashier.user.id })).toBe(1)
  expect(await count({ customer: 'member' })).toBe(1)
  expect(await count({ customer: 'guest' })).toBe(2)
  expect(await count({ cashierId: owner.user.id, customer: 'guest' })).toBe(1)
  const sold = async (query: Record<string, string | number>) =>
    ok(await owner.api.sales.reports.products.get({ query: { ...range, ...query } })).items[0]?.quantity
  expect(await sold({ cashierId: cashier.user.id })).toBe(1)
  expect(await sold({ customer: 'guest' })).toBe(2)
  const listed = ok(await owner.api.sales.reports.cashiers.get({ query: range }))
  expect(listed).toEqual({
    items: [
      { cashierId: owner.user.id, cashierName: owner.user.displayName, bills: 2 },
      { cashierId: cashier.user.id, cashierName: cashier.user.displayName, bills: 1 },
    ],
    total: 2,
  })
  expect(Number((await cashier.api.sales.reports.cashiers.get({ query: range })).error?.status)).toBe(403)
})
