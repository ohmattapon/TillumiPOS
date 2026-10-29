import type { Page } from '../../../../domains/page'
import type { PaymentMethod } from '../../../../domains/sale.domain'
import type { SalesReportSums } from '../../../../domains/sales-report'

export interface SalesReportPeriod {
  from: string
  to: string
  timeZone: string
  /** null explicitly requests every branch, including closed branches. Owner-only. */
  branchId: number | null
  /** Only bills rung up by this cashier. */
  cashierId?: number
  /** Only bills with a member (`member`) or without one (`guest`). */
  customer?: 'member' | 'guest'
}
export interface ReportOverviewSums {
  summary: SalesReportSums
  days: (SalesReportSums & { day: string })[]
  tendered: { method: PaymentMethod; amountSatang: number }[]
  /** Lines of completed bills in the period that have no allocated share yet (old bills before the backfill). */
  unallocatedLines: number
}
export interface ReportProduct {
  productId: number
  productName: string
  sku: string
  quantity: number
  /** Line totals before bill discounts and any VAT added at checkout. */
  lineTotalSatang: number
}
export interface ReportPromotion {
  promotionId: number
  /** The name on the latest sale in the range, so bills keep the name they were sold under. */
  name: string
  bills: number
  discountSatang: number
  /** Bill totals net of VAT, added up as the other reports do. */
  netSalesSatang: number
}
export interface ReportPromotionTotals {
  bills: number
  discountSatang: number
  netSalesSatang: number
}
/** `totals` and `completedBills` cover every promotion in the period, not only the rows of the page. */
export type ReportPromotionPage = Page<ReportPromotion> & { totals: ReportPromotionTotals; completedBills: number }
export interface ReportCashier {
  cashierId: number
  /** The name on the cashier's latest bill in the range, so bills keep the name they were sold under. */
  cashierName: string
  /** Completed and voided bills both count: the list picks who to filter by. */
  bills: number
}
export interface ReportCategorySums {
  /** The category stored on the bill lines when they were sold; null for lines sold with none. */
  categoryId: number | null
  quantity: number
  /** The lines' share of bill totals after discount, net of VAT. */
  netSalesSatang: number
  vatSatang: number
  costSatang: number
}
export interface ReportCategoryTotals {
  quantity: number
  netSalesSatang: number
  costSatang: number
}
/** `totals` cover every category in the period, not only the rows of the page. */
export type ReportCategoryPage = Page<ReportCategorySums> & { totals: ReportCategoryTotals }
export type ReportPageQuery = SalesReportPeriod & { limit: number; offset: number }
export type ReportItemSort = 'quantity' | 'sales' | 'profit' | 'margin'
export interface ReportItem {
  productId: number
  productName: string
  sku: string
  /** Units of the product in one of this row's quantity; 1 for a piece. */
  packSize: number
  /** How many of this pack size were sold. */
  quantity: number
  /** quantity × packSize: stock units sold. */
  pieces: number
  /** The lines' share of bill totals after discount, net of VAT. */
  netSalesSatang: number
  vatSatang: number
  costSatang: number
  profitSatang: number
}
export type ReportItemQuery = ReportPageQuery & {
  /** A category id; null means lines with no category. Absent means every category. */
  categoryId?: number | null
  sort: ReportItemSort
}
export interface ReportItemTotals {
  quantity: number
  pieces: number
  netSalesSatang: number
  costSatang: number
  profitSatang: number
}
/** `totals` cover every product and pack size that matches the filters, not only the rows of the page. */
export type ReportItemPage = Page<ReportItem> & { totals: ReportItemTotals }
export interface ISalesReportRepository {
  overview(period: SalesReportPeriod): Promise<ReportOverviewSums>
  products(query: ReportPageQuery): Promise<Page<ReportProduct>>
  /** Per product and pack size, completed bills only, sorted descending by `sort` and then by product id. */
  items(query: ReportItemQuery): Promise<ReportItemPage>
  /** Per category stored on the line, completed bills only, sorted by net sales descending, then category id with no category last. */
  categories(query: ReportPageQuery): Promise<ReportCategoryPage>
  branches(query: ReportPageQuery): Promise<Page<SalesReportSums & { branchId: number }>>
  promotions(query: ReportPageQuery): Promise<ReportPromotionPage>
  /** Ignores `cashierId` and `customer`, so the list shows everyone who sold in the range. */
  cashiers(period: SalesReportPeriod): Promise<ReportCashier[]>
}
export const salesReportRepositoryToken = Symbol('ISalesReportRepository').toString()
