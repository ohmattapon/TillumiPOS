import { beforeEach, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { mockSalesReportRepository, mockReportTimeZone, mockReportBranchNames, mockReportCategoryNames } from '../../../../__tests__/mocks'
import { GetSalesReportUseCase } from './get-sales-report.usecase'
import { GetPromotionReportUseCase } from './get-promotion-report.usecase'
import { ListReportProductsUseCase } from './list-report-products.usecase'
import { ListReportBranchesUseCase } from './list-report-branches.usecase'
import { ListReportCashiersUseCase } from './list-report-cashiers.usecase'
import { ListReportItemsUseCase } from './list-report-items.usecase'
import { ListReportCategoriesUseCase } from './list-report-categories.usecase'

const range = { from: '2026-01-01', to: '2026-01-31' }
const owner = { role: 'owner' as const }
const sums = { saleCount: 1, voidedCount: 1, totalSatang: 10700, vatSatang: 700, discountSatang: 500, costSatang: 6000, changeSatang: 300 }
const noTotals = { bills: 0, discountSatang: 0, netSalesSatang: 0 }
const noItemTotals = { quantity: 0, pieces: 0, netSalesSatang: 0, costSatang: 0, profitSatang: 0 }
const noCategoryTotals = { quantity: 0, netSalesSatang: 0, costSatang: 0 }
let reports: ReturnType<typeof mockSalesReportRepository>
let zone: ReturnType<typeof mockReportTimeZone>
let branchNames: ReturnType<typeof mockReportBranchNames>
let overview: GetSalesReportUseCase
let products: ListReportProductsUseCase
let comparison: ListReportBranchesUseCase
let promotionReport: GetPromotionReportUseCase
let cashierList: ListReportCashiersUseCase
let itemList: ListReportItemsUseCase
let categoryNames: ReturnType<typeof mockReportCategoryNames>
let categoryList: ListReportCategoriesUseCase
beforeEach(() => {
  reports = mockSalesReportRepository()
  zone = mockReportTimeZone('Asia/Bangkok')
  branchNames = mockReportBranchNames(new Map([[3, 'สาขาปิด']]))
  reports.overview.mockResolvedValue({ summary: sums, days: [{ day: '2026-01-01', ...sums }], tendered: [{ method: 'cash', amountSatang: 11000 }], unallocatedLines: 4 })
  reports.products.mockResolvedValue({ items: [], total: 0 })
  reports.branches.mockResolvedValue({ items: [{ branchId: 3, ...sums }], total: 1 })
  reports.promotions.mockResolvedValue({ items: [], total: 0, totals: noTotals, completedBills: 0 })
  overview = new GetSalesReportUseCase(reports, zone)
  products = new ListReportProductsUseCase(reports, zone)
  comparison = new ListReportBranchesUseCase(reports, zone, branchNames)
  promotionReport = new GetPromotionReportUseCase(reports, zone)
  cashierList = new ListReportCashiersUseCase(reports, zone)
  itemList = new ListReportItemsUseCase(reports, zone)
  categoryNames = mockReportCategoryNames(new Map([[1, 'เครื่องดื่ม']]))
  categoryList = new ListReportCategoriesUseCase(reports, zone, categoryNames)
  reports.categories.mockResolvedValue({ items: [], total: 0, totals: noCategoryTotals })
  reports.items.mockResolvedValue({ items: [], total: 0, totals: noItemTotals })
})
test('keeps branch scope explicit and cash net of change', async () => {
  const result = await overview.execute(range, owner, 9)
  expect(reports.overview).toHaveBeenCalledWith({ ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok' })
  expect(result.summary.profitSatang).toBe(4000)
  expect(result.byMethod.find((row) => row.method === 'cash')?.amountSatang).toBe(10700)
})
test('reports how many lines of completed bills have no share yet', async () => {
  const result = await overview.execute(range, owner, 9)
  expect(result.unallocatedLines).toBe(4)
})
test('compare reads the same-length period before and returns it as previous', async () => {
  const before = { ...sums, totalSatang: 5350, vatSatang: 350 }
  reports.overview.mockResolvedValueOnce({ summary: sums, days: [], tendered: [], unallocatedLines: 0 })
  reports.overview.mockResolvedValueOnce({ summary: before, days: [], tendered: [], unallocatedLines: 0 })
  const result = await overview.execute({ ...range, compare: true }, owner, 9)
  expect(reports.overview).toHaveBeenCalledTimes(2)
  expect(reports.overview).toHaveBeenLastCalledWith({
    from: '2025-12-01', to: '2025-12-31', scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok',
  })
  expect(result.previous).toMatchObject({ totalSatang: 5350, netSalesSatang: 5000 })
})
test('without compare the previous period is not read', async () => {
  const result = await overview.execute(range, owner, 9)
  expect(reports.overview).toHaveBeenCalledTimes(1)
  expect(result).not.toHaveProperty('previous')
})
test('compare given as the string false does not read the previous period', async () => {
  const result = await overview.execute({ ...range, compare: 'false' }, owner, 9)
  expect(reports.overview).toHaveBeenCalledTimes(1)
  expect(result).not.toHaveProperty('previous')
})
test('all-branch scope is explicit; pagination and closed branch names are preserved', async () => {
  await products.execute({ ...range, scope: 'all', limit: 7, offset: 14 }, owner, 9)
  expect(reports.products).toHaveBeenCalledWith({ ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok', limit: 7, offset: 14 })
  expect((await comparison.execute({ ...range, scope: 'all' }, owner, 9)).items[0]?.branchName).toBe('สาขาปิด')
})
test('a branch with no known name is shown by its id', async () => {
  reports.branches.mockResolvedValue({ items: [{ branchId: 8, ...sums }], total: 1 })
  expect((await comparison.execute({ ...range, scope: 'all' }, owner, 9)).items[0]?.branchName).toBe('8')
})
test('every report refuses cashier access before reading any port', async () => {
  for (const usecase of [overview, products, comparison, promotionReport])
    await expect(usecase.execute(range, { role: 'cashier' }, 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'reports.read' } })
  expect(zone.timeZone).not.toHaveBeenCalled()
})
test('rejects invalid dates, reversed ranges, excessive ranges and invalid pagination', async () => {
  for (const query of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-02-01', to: '2026-01-01' }, { from: '2025-01-01', to: '2026-01-02' }])
    await expect(overview.execute(query, owner, 1)).rejects.toBeInstanceOf(ZodError)
  for (const query of [{ limit: 501 }, { limit: 0 }, { offset: -1 }])
    await expect(products.execute({ ...range, ...query }, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(reports.overview).not.toHaveBeenCalled()
})
test('validates the range like the other reports', async () => {
  const rows = [{ promotionId: 4, name: 'ซื้อ 2 แถม 1', bills: 2, discountSatang: 900, netSalesSatang: 3100 }]
  const totals = { bills: 5, discountSatang: 2100, netSalesSatang: 9000 }
  reports.promotions.mockResolvedValue({ items: rows, total: 1, totals, completedBills: 8 })
  expect(await promotionReport.execute({ ...range, limit: 7, offset: 14 }, owner, 9)).toEqual({ items: rows, total: 1, totals, completedBills: 8 })
  expect(reports.promotions).toHaveBeenCalledWith({
    ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok', limit: 7, offset: 14,
  })
  const allBranches = await promotionReport.execute({ ...range, scope: 'all' }, owner, 9)
  expect(allBranches.total).toBe(1)
  expect(reports.promotions).toHaveBeenLastCalledWith({
    ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok', limit: 20, offset: 0,
  })
  reports.promotions.mockClear()
  for (const query of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-02-01', to: '2026-01-01' },
    { from: '2025-01-01', to: '2026-01-02' },
    { ...range, limit: 501 },
    { ...range, offset: -1 },
  ]) await expect(promotionReport.execute(query, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(reports.promotions).not.toHaveBeenCalled()
})
test('the cashier and member filters reach every report, and the compare period keeps them', async () => {
  const filters = { cashierId: '7', customer: 'member' }
  await overview.execute({ ...range, ...filters, compare: true }, owner, 9)
  expect(reports.overview).toHaveBeenNthCalledWith(1, { ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok', cashierId: 7, customer: 'member' })
  expect(reports.overview).toHaveBeenNthCalledWith(2, {
    from: '2025-12-01', to: '2025-12-31', scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok', cashierId: 7, customer: 'member',
  })
  await products.execute({ ...range, ...filters }, owner, 9)
  await comparison.execute({ ...range, ...filters }, owner, 9)
  await promotionReport.execute({ ...range, ...filters }, owner, 9)
  for (const read of [reports.products, reports.branches, reports.promotions])
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ cashierId: 7, customer: 'member' }))
})
test('without filters the repositories get no cashier or customer key', async () => {
  await overview.execute(range, owner, 9)
  expect(reports.overview.mock.calls[0]?.[0]).not.toHaveProperty('cashierId')
  expect(reports.overview.mock.calls[0]?.[0]).not.toHaveProperty('customer')
})
test('rejects a cashier id that is not a positive integer and an unknown customer kind', async () => {
  for (const bad of [{ cashierId: 0 }, { cashierId: -1 }, { cashierId: 1.5 }, { customer: 'everyone' }])
    await expect(overview.execute({ ...range, ...bad }, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(reports.overview).not.toHaveBeenCalled()
})
test('lists cashiers of the range with the row count as the total, ignoring the other filters', async () => {
  const rows = [{ cashierId: 2, cashierName: 'ก', bills: 2 }, { cashierId: 5, cashierName: 'ข', bills: 1 }]
  reports.cashiers.mockResolvedValue(rows)
  expect(await cashierList.execute({ ...range, cashierId: 2, customer: 'guest' }, owner, 9)).toEqual({ items: rows, total: 2 })
  expect(reports.cashiers).toHaveBeenCalledWith({ ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok' })
  await cashierList.execute({ ...range, scope: 'all' }, owner, 9)
  expect(reports.cashiers).toHaveBeenLastCalledWith({ ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok' })
})
test('the cashier list refuses a cashier and a bad range before reading any port', async () => {
  await expect(cashierList.execute(range, { role: 'cashier' }, 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  await expect(cashierList.execute({ from: '2026-02-01', to: '2026-01-01' }, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(zone.timeZone).not.toHaveBeenCalled()
  expect(reports.cashiers).not.toHaveBeenCalled()
})
test('the item report sorts by quantity by default and passes the filters, scope and paging to the repository', async () => {
  const row = {
    productId: 4, productName: 'ชา', sku: 'T-1', packSize: 12, quantity: 2, pieces: 24,
    netSalesSatang: 5000, vatSatang: 327, costSatang: 3000, profitSatang: 2000,
  }
  const totals = { quantity: 9, pieces: 40, netSalesSatang: 12000, costSatang: 7000, profitSatang: 5000 }
  reports.items.mockResolvedValue({ items: [row], total: 1, totals })
  expect(await itemList.execute({ ...range, cashierId: '7', customer: 'guest', limit: 7, offset: 14 }, owner, 9)).toEqual({ items: [row], total: 1, totals })
  expect(reports.items).toHaveBeenCalledWith({
    ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok', cashierId: 7, customer: 'guest', sort: 'quantity', limit: 7, offset: 14,
  })
  await itemList.execute({ ...range, scope: 'all', sort: 'margin' }, owner, 9)
  expect(reports.items).toHaveBeenLastCalledWith({
    ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok', sort: 'margin', limit: 20, offset: 0,
  })
})
test('the item report reads a category id as a number and the word none as no category', async () => {
  await itemList.execute({ ...range, categoryId: '3' }, owner, 9)
  expect(reports.items).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 3 }))
  await itemList.execute({ ...range, categoryId: 5 }, owner, 9)
  expect(reports.items).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 5 }))
  await itemList.execute({ ...range, categoryId: 'none' }, owner, 9)
  expect(reports.items).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: null }))
  await itemList.execute(range, owner, 9)
  expect(reports.items.mock.calls.at(-1)?.[0]).not.toHaveProperty('categoryId')
})
test('the item report refuses a cashier, a bad range, a bad sort and a bad category before reading any port', async () => {
  await expect(itemList.execute(range, { role: 'cashier' }, 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'reports.read' } })
  for (const bad of [{ from: '2026-02-01', to: '2026-01-01' }, { ...range, sort: 'name' }, { ...range, categoryId: 0 }, { ...range, categoryId: 'abc' }, { ...range, limit: 501 }])
    await expect(itemList.execute(bad, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(zone.timeZone).not.toHaveBeenCalled()
  expect(reports.items).not.toHaveBeenCalled()
})
const categoryRow = (categoryId: number | null, netSalesSatang: number) => ({
  categoryId, quantity: 2, netSalesSatang, vatSatang: 0, costSatang: 1000,
})
test('the category report names a category, leaves a deleted or missing one unnamed, and shares against the overview', async () => {
  // The overview mock nets 10000 satang (10700 total less 700 VAT).
  reports.categories.mockResolvedValue({
    items: [categoryRow(1, 5000), categoryRow(2, 3333), categoryRow(null, 1667)], total: 3,
    totals: { quantity: 11, netSalesSatang: 10000, costSatang: 4000 },
  })
  const result = await categoryList.execute({ ...range, limit: 7, offset: 14 }, owner, 9)
  expect(result.total).toBe(3)
  // The totals cover every category, so profit is worked out from them and not from the page.
  expect(result.totals).toEqual({ quantity: 11, netSalesSatang: 10000, costSatang: 4000, profitSatang: 6000 })
  expect(result.items).toEqual([
    { ...categoryRow(1, 5000), name: 'เครื่องดื่ม', profitSatang: 4000, shareBp: 5000 },
    { ...categoryRow(2, 3333), name: null, profitSatang: 2333, shareBp: 3333 },
    { ...categoryRow(null, 1667), name: null, profitSatang: 667, shareBp: 1667 },
  ])
  expect(categoryNames.namesFor).toHaveBeenCalledWith([1, 2])
  expect(reports.categories).toHaveBeenCalledWith({
    ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok', limit: 7, offset: 14,
  })
  expect(reports.overview).toHaveBeenCalledWith({ ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok' })
})
test('the category share rounds down and is zero when the period has no net sales', async () => {
  reports.categories.mockResolvedValue({ items: [categoryRow(1, 3333)], total: 1, totals: noCategoryTotals })
  reports.overview.mockResolvedValue({ summary: { ...sums, totalSatang: 20000, vatSatang: 0 }, days: [], tendered: [], unallocatedLines: 0 })
  expect((await categoryList.execute(range, owner, 9)).items[0]?.shareBp).toBe(1666)
  reports.overview.mockResolvedValue({ summary: { ...sums, totalSatang: 700, vatSatang: 700 }, days: [], tendered: [], unallocatedLines: 0 })
  expect((await categoryList.execute(range, owner, 9)).items[0]?.shareBp).toBe(0)
})
test('the category report keeps the cashier and customer filters in both reads and all-branch scope', async () => {
  await categoryList.execute({ ...range, scope: 'all', cashierId: '7', customer: 'guest' }, owner, 9)
  const period = { ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok', cashierId: 7, customer: 'guest' }
  expect(reports.overview).toHaveBeenCalledWith(period)
  expect(reports.categories).toHaveBeenCalledWith({ ...period, limit: 20, offset: 0 })
  expect(categoryNames.namesFor).not.toHaveBeenCalled()
})
test('the category report refuses a cashier and a bad range before reading any port', async () => {
  await expect(categoryList.execute(range, { role: 'cashier' }, 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'reports.read' } })
  for (const bad of [{ from: '2026-02-01', to: '2026-01-01' }, { ...range, limit: 501 }])
    await expect(categoryList.execute(bad, owner, 1)).rejects.toBeInstanceOf(ZodError)
  expect(zone.timeZone).not.toHaveBeenCalled()
  expect(reports.categories).not.toHaveBeenCalled()
  expect(categoryNames.namesFor).not.toHaveBeenCalled()
})
