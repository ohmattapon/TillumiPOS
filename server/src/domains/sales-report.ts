/** Aggregates use the price, VAT and cost snapshots stored on each sale. */
export interface SalesReportSums {
  saleCount: number
  voidedCount: number
  totalSatang: number
  vatSatang: number
  discountSatang: number
  costSatang: number
  changeSatang: number
}

/** Gross profit excludes VAT and operating expenses; voided sales contribute no money. */
export function calculateReportMetrics({ changeSatang: _change, ...sums }: SalesReportSums) {
  const netSalesSatang = sums.totalSatang - sums.vatSatang
  return { ...sums, netSalesSatang, profitSatang: netSalesSatang - sums.costSatang }
}

const DAY_MS = 86400000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The same number of days as from..to, ending the day before `from`. Calendar dates only, so no clock or zone is involved. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = Date.parse(from)
  const days = (Date.parse(to) - start) / DAY_MS + 1
  return { from: isoDay(start - days * DAY_MS), to: isoDay(start - DAY_MS) }
}

/** Change from `previous` to `current` in basis points (1240 = +12.4%), rounded half away from zero; null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  const bp = ((current - previous) * 10000) / Math.abs(previous)
  return Math.sign(bp) * Math.round(Math.abs(bp))
}
