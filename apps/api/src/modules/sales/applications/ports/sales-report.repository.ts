import type { Page } from '../../../../domains/page'
import type { PaymentMethod } from '../../../../domains/sale.domain'
import type { SalesReportSums } from '../../../../domains/sales-report'

export interface SalesReportPeriod {
  from: string
  to: string
  timeZone: string
  /** null explicitly requests every branch, including closed branches. Owner-only. */
  branchId: number | null
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
export type ReportPageQuery = SalesReportPeriod & { limit: number; offset: number }
export interface ISalesReportRepository {
  overview(period: SalesReportPeriod): Promise<ReportOverviewSums>
  products(query: ReportPageQuery): Promise<Page<ReportProduct>>
  branches(query: ReportPageQuery): Promise<Page<SalesReportSums & { branchId: number }>>
}
export const salesReportRepositoryToken = Symbol('ISalesReportRepository').toString()
