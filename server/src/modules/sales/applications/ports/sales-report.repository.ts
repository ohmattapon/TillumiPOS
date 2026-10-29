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
export interface ReportCashier {
  cashierId: number
  /** The name on the cashier's latest bill in the range, so bills keep the name they were sold under. */
  cashierName: string
  /** Completed and voided bills both count: the list picks who to filter by. */
  bills: number
}
export type ReportPageQuery = SalesReportPeriod & { limit: number; offset: number }
export interface ISalesReportRepository {
  overview(period: SalesReportPeriod): Promise<ReportOverviewSums>
  products(query: ReportPageQuery): Promise<Page<ReportProduct>>
  branches(query: ReportPageQuery): Promise<Page<SalesReportSums & { branchId: number }>>
  promotions(query: ReportPageQuery): Promise<Page<ReportPromotion>>
  /** Ignores `cashierId` and `customer`, so the list shows everyone who sold in the range. */
  cashiers(period: SalesReportPeriod): Promise<ReportCashier[]>
}
export const salesReportRepositoryToken = Symbol('ISalesReportRepository').toString()
