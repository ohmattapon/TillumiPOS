import { injectable } from 'tsyringe'
import type { Page } from '../../../../domains/page'
import type { PaymentMethod, SaleEntity } from '../../../../domains/sale.domain'
import type { SalesReportSums } from '../../../../domains/sales-report'
import type {
  ISalesReportRepository,
  ReportOverviewSums,
  ReportPageQuery,
  ReportProduct,
  SalesReportPeriod,
} from '../../applications/ports/sales-report.repository'
import { MemorySaleRepository } from './sale.memory.repository'

const DAY_MS = 86_400_000
const NOON_MS = 12 * 3_600_000
const METHOD_ORDER: PaymentMethod[] = ['card', 'cash', 'promptpay']

// Shop-calendar day of an instant, like the drizzle twin's
// `(created_at at time zone $tz)::date`. en-CA formats as YYYY-MM-DD, and
// format() takes an epoch instant, so no date is constructed here.
const dayOf = (atMs: number, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(atMs)

// Instant of midnight opening a shop-calendar day. The zone offset is read at
// the guessed instant and applied twice, so zones with daylight saving also
// land on midnight; Asia/Bangkok has none and lands on the first pass.
const dayStartMs = (day: string, timeZone: string): number => {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`)
  const offsetMs = (atMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(atMs)
    const get = (type: string): number => Number(parts.find((part) => part.type === type)!.value)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - atMs
  }
  return midnightUtc - offsetMs(midnightUtc - offsetMs(midnightUtc))
}

// Every shop-calendar day from `from` through `to`, oldest first, like the
// drizzle twin's generate_series. Midday instants keep the label right across
// daylight-saving changes without constructing dates.
const daysOf = (period: SalesReportPeriod): string[] => {
  const start = dayStartMs(period.from, period.timeZone)
  const count = Math.round((dayStartMs(period.to, period.timeZone) - start) / DAY_MS)
  return Array.from({ length: count + 1 }, (_, index) => dayOf(start + index * DAY_MS + NOON_MS, period.timeZone))
}

// Money over completed sales only; voided sales count apart, like the drizzle twin's sums.
const sumsOf = (sales: SaleEntity[]): SalesReportSums => {
  const completed = sales.filter((sale) => sale.status === 'completed')
  return {
    saleCount: completed.length,
    voidedCount: sales.length - completed.length,
    totalSatang: completed.reduce((total, sale) => total + sale.totalSatang, 0),
    vatSatang: completed.reduce((total, sale) => total + sale.vatSatang, 0),
    discountSatang: completed.reduce((total, sale) => total + sale.discountSatang, 0),
    costSatang: completed.reduce(
      (total, sale) => total + sale.items.reduce((lines, item) => lines + item.unitCostSatang * item.quantity, 0),
      0,
    ),
    changeSatang: completed.reduce((total, sale) => total + sale.changeSatang, 0),
  }
}

const tenderedOf = (sales: SaleEntity[]): { method: PaymentMethod; amountSatang: number }[] => {
  const tendered = new Map<PaymentMethod, number>()
  for (const sale of sales)
    for (const payment of sale.payments)
      tendered.set(payment.method, (tendered.get(payment.method) ?? 0) + payment.amountSatang)
  // Alphabetical by method, like the drizzle twin's `order by method`.
  return METHOD_ORDER.filter((method) => tendered.has(method)).map((method) => ({
    method,
    amountSatang: tendered.get(method)!,
  }))
}

/**
 * No-database sales report: aggregates read from the sales' own memory store
 * through a non-port helper, so the report never grows a query on the sales
 * port for its own sake. Bounds mirror the drizzle twin: the shop-calendar
 * days from `from` through `to` in the period's timeZone, [from_at, to_at).
 */
@injectable()
export class MemorySalesReportRepository implements ISalesReportRepository {
  constructor(private readonly sales: MemorySaleRepository) {}

  async overview(period: SalesReportPeriod): Promise<ReportOverviewSums> {
    const sales = await this.inBounds(period)
    const completed = sales.filter((sale) => sale.status === 'completed')
    // One row per day even when nothing sold, like the drizzle twin's series.
    const days = daysOf(period).map((day) => ({
      ...sumsOf(completed.filter((sale) => dayOf(sale.createdAt.getTime(), period.timeZone) === day)),
      day,
    }))
    return { summary: sumsOf(completed), days, tendered: tenderedOf(completed) }
  }

  async products(query: ReportPageQuery): Promise<Page<ReportProduct>> {
    const sales = await this.inBounds(query)
    const grouped = new Map<number, ReportProduct>()
    // Oldest first, so the latest line wins the name and SKU, like the
    // drizzle twin's `array_agg ... order by id desc`.
    for (const sale of sales)
      for (const item of sale.items) {
        const row = grouped.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          quantity: 0,
          lineTotalSatang: 0,
        }
        row.productName = item.productName
        row.sku = item.sku
        row.quantity += item.quantity
        row.lineTotalSatang += item.lineTotalSatang
        grouped.set(item.productId, row)
      }
    const ordered = [...grouped.values()].sort(
      (a, b) => b.quantity - a.quantity || b.lineTotalSatang - a.lineTotalSatang || a.productId - b.productId,
    )
    return { items: ordered.slice(query.offset, query.offset + query.limit), total: ordered.length }
  }

  async branches(query: ReportPageQuery): Promise<Page<SalesReportSums & { branchId: number }>> {
    const sales = await this.inBounds(query)
    const byBranch = new Map<number, SaleEntity[]>()
    for (const sale of sales) {
      const rows = byBranch.get(sale.branchId) ?? []
      rows.push(sale)
      byBranch.set(sale.branchId, rows)
    }
    const ordered = [...byBranch.entries()]
      .map(([branchId, rows]) => ({ ...sumsOf(rows), branchId }))
      .sort((a, b) => b.totalSatang - a.totalSatang || a.branchId - b.branchId)
    return { items: ordered.slice(query.offset, query.offset + query.limit), total: ordered.length }
  }

  private async inBounds(query: SalesReportPeriod): Promise<SaleEntity[]> {
    const fromMs = dayStartMs(query.from, query.timeZone)
    const toMs = dayStartMs(query.to, query.timeZone) + DAY_MS
    return this.sales.findForReport({ fromMs, toMs, branchId: query.branchId })
  }
}
