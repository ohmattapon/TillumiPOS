import { expect, test } from 'bun:test'
import { calculateReportMetrics, type SalesReportSums } from './sales-report'
const sums: SalesReportSums = { saleCount: 1, voidedCount: 2, totalSatang: 10700, vatSatang: 700, discountSatang: 500, costSatang: 6000, changeSatang: 300 }
test('gross profit excludes VAT and uses stored cost; discounts are already in the total', () => {
  expect(calculateReportMetrics(sums)).toMatchObject({ netSalesSatang: 10000, profitSatang: 4000, voidedCount: 2 })
  expect(calculateReportMetrics(sums)).not.toHaveProperty('changeSatang')
})
test('losses remain negative', () => {
  expect(calculateReportMetrics({ ...sums, costSatang: 12000 }).profitSatang).toBe(-2000)
})
