import { expect, test } from 'bun:test'
import { calculateReportMetrics, percentChange, previousPeriod, type SalesReportSums } from './sales-report'
const sums: SalesReportSums = { saleCount: 1, voidedCount: 2, totalSatang: 10700, vatSatang: 700, discountSatang: 500, costSatang: 6000, changeSatang: 300 }
test('gross profit excludes VAT and uses stored cost; discounts are already in the total', () => {
  expect(calculateReportMetrics(sums)).toMatchObject({ netSalesSatang: 10000, profitSatang: 4000, voidedCount: 2 })
  expect(calculateReportMetrics(sums)).not.toHaveProperty('changeSatang')
})
test('losses remain negative', () => {
  expect(calculateReportMetrics({ ...sums, costSatang: 12000 }).profitSatang).toBe(-2000)
})
test('the previous period has the same length and ends the day before', () => {
  expect(previousPeriod('2026-10-01', '2026-10-28')).toEqual({ from: '2026-09-03', to: '2026-09-30' })
  expect(previousPeriod('2026-03-01', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' })
})
test('percent change is in basis points, rounded half away from zero', () => {
  expect(percentChange(11240, 10000)).toBe(1240)
  expect(percentChange(9800, 10000)).toBe(-200)
  expect(percentChange(1, 8)).toBe(-8750)
  expect(percentChange(10005, 80000)).toBe(-8749)
  expect(percentChange(3, 2000)).toBe(-9985)
  expect(percentChange(10, 8)).toBe(2500)
})
test('percent change is null when there is no previous figure', () => {
  expect(percentChange(0, 0)).toBeNull()
  expect(percentChange(5, 0)).toBeNull()
})
