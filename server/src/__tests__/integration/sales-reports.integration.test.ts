import { beforeEach, expect, test } from 'bun:test'
import { resetDatabase, signIn, seedProduct, ok, type Session } from '../../../test/harness'
import { client as sql } from '../../libs/db'
import { assertConnectedTestDatabase } from '../../../test/database'
import { backfillSaleLines } from '../../infrastructure/database/backfill-sale-lines'
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
test('totals cover every promotion and the bills that used none, and follow the cashier filter', async () => {
  const cashier = await signIn('cashier')
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1000, stock: 40 })
  const bundle = ok(await owner.api.promotions.post({
    name: 'ซื้อ 2 แถม 1', kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1,
    scope: { productIds: [tea.id], categoryIds: [] },
  }))
  const coupon = ok(await owner.api.promotions.post({ name: 'คูปองลด 10%', kind: 'percent', value: 1000, couponCode: 'SUMMER10' }))
  const sellWithQuote = async (who: typeof owner, quantity: number, couponCode?: string) => {
    const quote = ok(await who.api.quotes.post({
      lines: [{ productId: tea.id, quantity }], ...(couponCode === undefined ? {} : { couponCode }),
    }))
    return ok(await who.api.sales.post({
      items: [{ productId: tea.id, quantity }],
      payments: [{ method: 'cash' as const, amountSatang: quote.totalSatang }],
      quoteId: quote.id,
    }))
  }
  const bundled = await sellWithQuote(owner, 3)
  const couponed = await sellWithQuote(cashier, 2, 'SUMMER10')
  const plain = await sell(owner, tea.id)
  expect(bundled.promotion?.id).toBe(bundle.id)
  expect(couponed.promotion?.id).toBe(coupon.id)
  for (const sale of [bundled, couponed, plain]) await dateSale(sale.id, '2026-01-02T03:00:00Z')

  const all = ok(await owner.api.sales.reports.promotions.get({ query: { ...range, limit: 1 } }))
  expect(all.items).toHaveLength(1)
  expect(all.completedBills).toBe(3)
  expect(all.totals).toEqual({
    bills: 2,
    discountSatang: bundled.discountSatang + couponed.discountSatang,
    netSalesSatang: bundled.totalSatang - bundled.vatSatang + couponed.totalSatang - couponed.vatSatang,
  })
  const byCashier = ok(await owner.api.sales.reports.promotions.get({ query: { ...range, cashierId: cashier.user.id } }))
  expect(byCashier.completedBills).toBe(1)
  expect(byCashier.totals).toEqual({
    bills: 1, discountSatang: couponed.discountSatang, netSalesSatang: couponed.totalSatang - couponed.vatSatang,
  })
  const byOwner = ok(await owner.api.sales.reports.promotions.get({ query: { ...range, cashierId: owner.user.id } }))
  expect(byOwner.completedBills).toBe(2)
  expect(byOwner.totals.bills).toBe(1)
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
async function sellPieceAndPack() {
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1500, stock: 40 })
  ok(await owner.api.catalog.products({ id: tea.id }).patch({
    packs: [{ barcode: `885${String(tea.id).padStart(9, '0')}`, size: 12, priceSatang: 24000 }],
  }))
  const pack = ok(await owner.api.catalog.products({ id: tea.id }).get()).packs[0]!
  const bill = ok(await owner.api.sales.post({
    items: [{ productId: tea.id, quantity: 1 }, { productId: tea.id, quantity: 1, packId: pack.id }],
    discountSatang: 2650, payments: [{ method: 'cash', amountSatang: 30000 }],
  }))
  await dateSale(bill.id, '2026-01-02T03:00:00Z')
  return { tea, bill }
}
test('the item report splits a product by pack size and its net sales add up to the overview', async () => {
  const { tea } = await sellPieceAndPack()
  const report = ok(await owner.api.sales.reports.items.get({ query: range }))
  expect(report.total).toBe(2)
  expect(report.items.map((row) => [row.productId, row.packSize, row.quantity, row.pieces])).toEqual([[tea.id, 1, 1, 1], [tea.id, 12, 1, 12]])
  expect(report.items.reduce((sum, row) => sum + row.netSalesSatang, 0)).toBe(ok(await owner.api.sales.reports.get({ query: range })).summary.netSalesSatang)
  expect(report.items.map((row) => row.costSatang)).toEqual([1500, 18000])
  for (const row of report.items) expect(row.profitSatang).toBe(row.netSalesSatang - row.costSatang)
})
test('the item report sorts by profit, sales and margin and pages with a stable order', async () => {
  const { tea } = await sellPieceAndPack()
  const other = await seedProduct(owner, { priceSatang: 1000, costSatang: 100, stock: 5 })
  await dateSale((await sell(owner, other.id)).id, '2026-01-02T04:00:00Z')
  const by = async (sort: string, extra: Record<string, number> = {}) =>
    ok(await owner.api.sales.reports.items.get({ query: { ...range, sort: sort as 'profit', ...extra } })).items.map((row) => [row.productId, row.packSize])
  const rows = ok(await owner.api.sales.reports.items.get({ query: { ...range, sort: 'profit' } })).items
  expect(rows.map((row) => row.profitSatang)).toEqual([...rows.map((row) => row.profitSatang)].sort((a, b) => b - a))
  expect((await by('sales'))[0]).toEqual([tea.id, 12])
  expect((await by('margin'))[0]).toEqual([other.id, 1])
  expect(await by('quantity', { limit: 1, offset: 1 })).toEqual([[tea.id, 12]])
  expect(await by('quantity')).toEqual([[tea.id, 1], [tea.id, 12], [other.id, 1]])
})
test('the item report filters by category, with none for products without one, and the cashier filters apply', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const cashier = await signIn('cashier')
  const tea = await seedProduct(owner, { categoryId: drinks.id, stock: 5 })
  const plain = await seedProduct(owner, { stock: 5 })
  await dateSale((await sell(owner, tea.id)).id, '2026-01-02T03:00:00Z')
  await dateSale((await sell(cashier, plain.id)).id, '2026-01-02T03:00:00Z')
  const ids = async (query: Record<string, string | number>) =>
    ok(await owner.api.sales.reports.items.get({ query: { ...range, ...query } })).items.map((row) => row.productId)
  expect(await ids({ categoryId: String(drinks.id) })).toEqual([tea.id])
  expect(await ids({ categoryId: 'none' })).toEqual([plain.id])
  expect(await ids({ cashierId: cashier.user.id })).toEqual([plain.id])
  expect(await ids({ customer: 'member' })).toEqual([])
  expect(Number((await cashier.api.sales.reports.items.get({ query: range })).error?.status)).toBe(403)
  expect(Number((await owner.api.sales.reports.items.get({ query: { ...range, sort: 'name' as 'profit' } })).error?.status)).toBe(422)
})
test('the item report totals equal the sum of every row, the overview, and follow the page, the category and the cashier', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const cashier = await signIn('cashier')
  const { tea } = await sellPieceAndPack()
  const other = await seedProduct(owner, { categoryId: drinks.id, priceSatang: 1000, costSatang: 100, stock: 5 })
  const plain = await seedProduct(owner, { priceSatang: 700, costSatang: 200, stock: 5 })
  await dateSale((await sell(owner, other.id)).id, '2026-01-02T04:00:00Z')
  await dateSale((await sell(cashier, plain.id)).id, '2026-01-02T05:00:00Z')
  const sumOf = (rows: { quantity: number; pieces: number; netSalesSatang: number; costSatang: number; profitSatang: number }[]) => ({
    quantity: rows.reduce((n, row) => n + row.quantity, 0), pieces: rows.reduce((n, row) => n + row.pieces, 0),
    netSalesSatang: rows.reduce((n, row) => n + row.netSalesSatang, 0), costSatang: rows.reduce((n, row) => n + row.costSatang, 0),
    profitSatang: rows.reduce((n, row) => n + row.profitSatang, 0),
  })
  const whole = ok(await owner.api.sales.reports.items.get({ query: { ...range, limit: 500 } }))
  expect(whole.total).toBe(4)
  expect(whole.totals).toEqual(sumOf(whole.items))
  const summary = ok(await owner.api.sales.reports.get({ query: range })).summary
  expect(whole.totals).toMatchObject({ netSalesSatang: summary.netSalesSatang, costSatang: summary.costSatang, profitSatang: summary.profitSatang })
  // A page of one row still carries the totals of all of them.
  const paged = ok(await owner.api.sales.reports.items.get({ query: { ...range, limit: 1, offset: 2 } }))
  expect(paged.items).toHaveLength(1)
  expect(paged.totals).toEqual(whole.totals)
  const byCashier = ok(await owner.api.sales.reports.items.get({ query: { ...range, cashierId: cashier.user.id, limit: 500 } }))
  expect(byCashier.totals).toEqual(sumOf(byCashier.items))
  expect(byCashier.totals.quantity).toBe(1)
  expect(byCashier.totals).not.toEqual(whole.totals)
  const inDrinks = ok(await owner.api.sales.reports.items.get({ query: { ...range, categoryId: String(drinks.id) } }))
  expect(inDrinks.totals).toEqual(sumOf(inDrinks.items))
  expect(inDrinks.items.map((row) => row.productId)).toEqual([other.id])
  expect(tea.id).not.toBe(other.id)
})
test('the item report totals count a line with no share as zero net sales with its cost, and are zero for an empty period', async () => {
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 900, stock: 10 })
  await dateSale((await sell(owner, tea.id)).id, '2026-01-02T03:00:00Z')
  await sql`update sale_items set allocated_total_satang = null, allocated_vat_satang = null`
  const report = ok(await owner.api.sales.reports.items.get({ query: range }))
  expect(report.totals).toEqual({ quantity: 1, pieces: 1, netSalesSatang: 0, costSatang: 900, profitSatang: -900 })
  expect(ok(await owner.api.sales.reports.items.get({ query: { from: '2026-02-01', to: '2026-02-01' } })).totals)
    .toEqual({ quantity: 0, pieces: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0 })
})
test('a bill backfilled after the line shares were added matches the overview, and its lines keep no category', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const tea = await seedProduct(owner, { categoryId: drinks.id, priceSatang: 3333, stock: 10 })
  const cake = await seedProduct(owner, { priceSatang: 4001, stock: 10 })
  const bill = ok(await owner.api.sales.post({
    items: [{ productId: tea.id, quantity: 1 }, { productId: cake.id, quantity: 2 }],
    discountSatang: 101, payments: [{ method: 'cash', amountSatang: 20000 }],
  }))
  await dateSale(bill.id, '2026-01-02T03:00:00Z')
  await sql`update sale_items set allocated_total_satang = null, allocated_vat_satang = null, category_id = null where sale_id = ${bill.id}`
  expect(await backfillSaleLines(1)).toBe(1)
  const report = ok(await owner.api.sales.reports.items.get({ query: range }))
  expect(report.items.reduce((sum, row) => sum + row.netSalesSatang, 0)).toBe(ok(await owner.api.sales.reports.get({ query: range })).summary.netSalesSatang)
  expect(ok(await owner.api.sales.reports.items.get({ query: { ...range, categoryId: String(drinks.id) } })).items).toEqual([])
  expect(ok(await owner.api.sales.reports.items.get({ query: { ...range, categoryId: 'none' } })).items.map((row) => row.productId).sort()).toEqual([tea.id, cake.id].sort())
})
test('the overview counts lines of completed bills that have no share yet, and none after the backfill', async () => {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const bill = await sell(owner, tea.id)
  await dateSale(bill.id, '2026-01-02T03:00:00Z')
  expect(ok(await owner.api.sales.reports.get({ query: range })).unallocatedLines).toBe(0)
  await sql`update sale_items set allocated_total_satang = null, allocated_vat_satang = null where sale_id = ${bill.id}`
  expect(ok(await owner.api.sales.reports.get({ query: range })).unallocatedLines).toBe(1)
  await backfillSaleLines(1)
  expect(ok(await owner.api.sales.reports.get({ query: range })).unallocatedLines).toBe(0)
})
test('a sold line keeps the category it was sold in when the product moves to another category later', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const snacks = ok(await owner.api.catalog.categories.post({ name: 'ขนม' }))
  const tea = await seedProduct(owner, { categoryId: drinks.id, stock: 5 })
  await dateSale((await sell(owner, tea.id)).id, '2026-01-02T03:00:00Z')
  await sql`update products set category_id = ${snacks.id} where id = ${tea.id}`
  const rows = async (categoryId: number) =>
    ok(await owner.api.sales.reports.items.get({ query: { ...range, categoryId: String(categoryId) } })).items.map((row) => [row.productId, row.quantity])
  expect(await rows(drinks.id)).toEqual([[tea.id, 1]])
  expect(await rows(snacks.id)).toEqual([])
})
test('a line sold without a category stays without one when the product is given a category later', async () => {
  const drinks = ok(await owner.api.catalog.categories.post({ name: 'เครื่องดื่ม' }))
  const plain = await seedProduct(owner, { stock: 5 })
  await dateSale((await sell(owner, plain.id)).id, '2026-01-02T03:00:00Z')
  await sql`update products set category_id = ${drinks.id} where id = ${plain.id}`
  const rows = async (categoryId: string) =>
    ok(await owner.api.sales.reports.items.get({ query: { ...range, categoryId } })).items.map((row) => [row.productId, row.quantity])
  expect(await rows(String(drinks.id))).toEqual([])
  expect(await rows('none')).toEqual([[plain.id, 1]])
})
test('the promotion and item totals leave out a voided bill and follow the member or guest filter', async () => {
  const tea = await seedProduct(owner, { priceSatang: 2500, costSatang: 1000, stock: 40 })
  const member = ok(await owner.api.members.post({ name: 'สมาชิกรายงาน', phone: '0812345679' }))
  ok(await owner.api.promotions.post({ name: 'คูปองลด 10%', kind: 'percent', value: 1000, couponCode: 'SUMMER10' }))
  const sellWithCoupon = async (memberId?: number) => {
    const quote = ok(await owner.api.quotes.post({
      lines: [{ productId: tea.id, quantity: 2 }], couponCode: 'SUMMER10', ...(memberId === undefined ? {} : { memberId }),
    }))
    const bill = ok(await owner.api.sales.post({
      items: [{ productId: tea.id, quantity: 2 }], ...(memberId === undefined ? {} : { memberId }),
      payments: [{ method: 'cash' as const, amountSatang: quote.totalSatang }], quoteId: quote.id,
    }))
    await dateSale(bill.id, '2026-01-02T03:00:00Z')
    return bill
  }
  const guestBill = await sellWithCoupon()
  const memberBill = await sellWithCoupon(member.id)
  const voided = await sellWithCoupon()
  ok(await owner.api.sales({ id: voided.id }).void.post({ reason: 'ผิดรายการ' }))
  const net = (bill: typeof guestBill) => bill.totalSatang - bill.vatSatang

  const all = ok(await owner.api.sales.reports.promotions.get({ query: range }))
  expect(all.totals).toEqual({
    bills: 2, discountSatang: guestBill.discountSatang + memberBill.discountSatang, netSalesSatang: net(guestBill) + net(memberBill),
  })
  expect(all.completedBills).toBe(2)
  const members = ok(await owner.api.sales.reports.promotions.get({ query: { ...range, customer: 'member' } }))
  expect(members.totals).toEqual({ bills: 1, discountSatang: memberBill.discountSatang, netSalesSatang: net(memberBill) })
  const guests = ok(await owner.api.sales.reports.promotions.get({ query: { ...range, customer: 'guest' } }))
  expect(guests.totals).toEqual({ bills: 1, discountSatang: guestBill.discountSatang, netSalesSatang: net(guestBill) })

  const items = ok(await owner.api.sales.reports.items.get({ query: range }))
  expect(items.totals.quantity).toBe(4)
  expect(ok(await owner.api.sales.reports.categories.get({ query: range })).totals.quantity).toBe(4)
  expect(ok(await owner.api.sales.reports.categories.get({ query: { ...range, customer: 'member' } })).totals.quantity).toBe(2)
  expect(ok(await owner.api.sales.reports.items.get({ query: { ...range, customer: 'member' } })).totals.quantity).toBe(2)
  expect(ok(await owner.api.sales.reports.items.get({ query: { ...range, customer: 'guest' } })).totals.quantity).toBe(2)
})
