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
