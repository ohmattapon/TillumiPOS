import { expect, test } from 'bun:test'
import { categoriesTotalsRow, dailyTotalsCells, hasTotals, isTotalRow, itemsTotalsRow } from './report-totals'

const plain = (satang: number) => `฿${satang / 100}`

test('the item totals row carries the response totals under the label and is marked as a total', () => {
  const row = itemsTotalsRow('รวม', { quantity: 9, pieces: 40, netSalesSatang: 12000, costSatang: 7000, profitSatang: 5000 })
  expect(row).toMatchObject({ productName: 'รวม', quantity: 9, netSalesSatang: 12000, costSatang: 7000, profitSatang: 5000 })
  expect(isTotalRow(row)).toBe(true)
})
test('the category totals row carries the response totals and no share', () => {
  const row = categoriesTotalsRow('รวม', { quantity: 11, netSalesSatang: 10000, costSatang: 4000, profitSatang: 6000 })
  expect(row).toMatchObject({ name: 'รวม', categoryId: null, netSalesSatang: 10000, profitSatang: 6000, shareBp: 0 })
  expect(isTotalRow(row)).toBe(true)
})
test('a data row is not a total', () => {
  expect(isTotalRow({ productId: 1 })).toBe(false)
})
test('the daily footer takes bills, revenue and profit from the summary, not from the rows', () => {
  expect(dailyTotalsCells('รวม', { saleCount: 5, totalSatang: 90000, profitSatang: 15000 }, plain)).toEqual(['รวม', 5, '฿900', '฿150'])
})
test('a table with no rows has nothing to total', () => {
  expect(hasTotals(0)).toBe(false)
  expect(hasTotals(2)).toBe(true)
})
