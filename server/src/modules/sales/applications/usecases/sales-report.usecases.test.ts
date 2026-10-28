import { beforeEach, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { makeBranch } from '../../../../__tests__/factories'
import { mockSalesReportRepository, mockShopSettingsRepository, mockBranchRepository } from '../../../../__tests__/mocks'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { GetSalesReportUseCase } from './get-sales-report.usecase'
import { GetPromotionReportUseCase } from './get-promotion-report.usecase'
import { ListReportProductsUseCase } from './list-report-products.usecase'
import { ListReportBranchesUseCase } from './list-report-branches.usecase'

const range = { from: '2026-01-01', to: '2026-01-31' }
const owner = { role: 'owner' as const }
const sums = { saleCount: 1, voidedCount: 1, totalSatang: 10700, vatSatang: 700, discountSatang: 500, costSatang: 6000, changeSatang: 300 }
let reports: ReturnType<typeof mockSalesReportRepository>
let settings: ReturnType<typeof mockShopSettingsRepository>
let branches: ReturnType<typeof mockBranchRepository>
let overview: GetSalesReportUseCase
let products: ListReportProductsUseCase
let comparison: ListReportBranchesUseCase
let promotionReport: GetPromotionReportUseCase
beforeEach(() => {
  reports = mockSalesReportRepository()
  settings = mockShopSettingsRepository()
  branches = mockBranchRepository()
  settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  reports.overview.mockResolvedValue({ summary: sums, days: [{ day: '2026-01-01', ...sums }], tendered: [{ method: 'cash', amountSatang: 11000 }] })
  reports.products.mockResolvedValue({ items: [], total: 0 })
  reports.branches.mockResolvedValue({ items: [{ branchId: 3, ...sums }], total: 1 })
  reports.promotions.mockResolvedValue({ items: [], total: 0 })
  branches.findAll.mockResolvedValue([makeBranch({ id: 3, name: 'สาขาปิด', isActive: false })])
  overview = new GetSalesReportUseCase(reports, settings)
  products = new ListReportProductsUseCase(reports, settings)
  comparison = new ListReportBranchesUseCase(reports, settings, branches)
  promotionReport = new GetPromotionReportUseCase(reports, settings)
})
test('keeps branch scope explicit and cash net of change', async () => {
  const result = await overview.execute(range, owner, 9)
  expect(reports.overview).toHaveBeenCalledWith({ ...range, scope: 'branch', branchId: 9, timeZone: 'Asia/Bangkok' })
  expect(result.summary.profitSatang).toBe(4000)
  expect(result.byMethod.find((row) => row.method === 'cash')?.amountSatang).toBe(10700)
})
test('all-branch scope is explicit; pagination and closed branch names are preserved', async () => {
  await products.execute({ ...range, scope: 'all', limit: 7, offset: 14 }, owner, 9)
  expect(reports.products).toHaveBeenCalledWith({ ...range, scope: 'all', branchId: null, timeZone: 'Asia/Bangkok', limit: 7, offset: 14 })
  expect((await comparison.execute({ ...range, scope: 'all' }, owner, 9)).items[0]?.branchName).toBe('สาขาปิด')
})
test('every report refuses cashier access before reading any port', async () => {
  for (const usecase of [overview, products, comparison, promotionReport])
    await expect(usecase.execute(range, { role: 'cashier' }, 1)).rejects.toMatchObject({ code: 'PERMISSION_DENIED', params: { permission: 'reports.read' } })
  expect(settings.get).not.toHaveBeenCalled()
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
