import { beforeEach, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { mockSalesReportRepository, mockReportTimeZone, mockReportBranchNames } from '../../../../__tests__/mocks'
import { GetSalesReportUseCase } from './get-sales-report.usecase'
import { GetPromotionReportUseCase } from './get-promotion-report.usecase'
import { ListReportProductsUseCase } from './list-report-products.usecase'
import { ListReportBranchesUseCase } from './list-report-branches.usecase'
import { ListReportCashiersUseCase } from './list-report-cashiers.usecase'

const range = { from: '2026-01-01', to: '2026-01-31' }
const owner = { role: 'owner' as const }
const sums = { saleCount: 1, voidedCount: 1, totalSatang: 10700, vatSatang: 700, discountSatang: 500, costSatang: 6000, changeSatang: 300 }
let reports: ReturnType<typeof mockSalesReportRepository>
let zone: ReturnType<typeof mockReportTimeZone>
let branchNames: ReturnType<typeof mockReportBranchNames>
let overview: GetSalesReportUseCase
let products: ListReportProductsUseCase
let comparison: ListReportBranchesUseCase
let promotionReport: GetPromotionReportUseCase
let cashierList: ListReportCashiersUseCase
beforeEach(() => {
  reports = mockSalesReportRepository()
  zone = mockReportTimeZone('Asia/Bangkok')
  branchNames = mockReportBranchNames(new Map([[3, 'สาขาปิด']]))
  reports.overview.mockResolvedValue({ summary: sums, days: [{ day: '2026-01-01', ...sums }], tendered: [{ method: 'cash', amountSatang: 11000 }] })
  reports.products.mockResolvedValue({ items: [], total: 0 })
  reports.branches.mockResolvedValue({ items: [{ branchId: 3, ...sums }], total: 1 })
  reports.promotions.mockResolvedValue({ items: [], total: 0 })
  overview = new GetSalesReportUseCase(reports, zone)
  products = new ListReportProductsUseCase(reports, zone)
  comparison = new ListReportBranchesUseCase(reports, zone, branchNames)
  promotionReport = new GetPromotionReportUseCase(reports, zone)
  cashierList = new ListReportCashiersUseCase(reports, zone)
})
test('keeps branch scope explicit and cash net of change', async () => {
  const result = await overview.execute(range, owner, 9)
  expect(reports.overview).toHaveBeenCalledWith({ ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok' })
  expect(result.summary.profitSatang).toBe(4000)
  expect(result.byMethod.find((row) => row.method === 'cash')?.amountSatang).toBe(10700)
})
test('compare reads the same-length period before and returns it as previous', async () => {
  const before = { ...sums, totalSatang: 5350, vatSatang: 350 }
  reports.overview.mockResolvedValueOnce({ summary: sums, days: [], tendered: [] })
  reports.overview.mockResolvedValueOnce({ summary: before, days: [], tendered: [] })
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
  reports.promotions.mockResolvedValue({ items: rows, total: 1 })
  expect(await promotionReport.execute({ ...range, limit: 7, offset: 14 }, owner, 9)).toEqual({ items: rows, total: 1 })
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
