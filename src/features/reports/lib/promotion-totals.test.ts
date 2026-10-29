import { expect, test } from 'bun:test'
import { hasPromotionTotals, promotionTotalsCells } from './promotion-totals'

test('the footer cells come from the totals, not from the rows on the page', () => {
  const cells = promotionTotalsCells('รวม', { bills: 5, discountSatang: 2100, netSalesSatang: 9000 }, (satang) => `฿${satang / 100}`)
  expect(cells).toEqual(['รวม', 5, '฿21', '฿90'])
})
test('no totals row when there is no promotion', () => {
  expect(hasPromotionTotals(0)).toBe(false)
  expect(hasPromotionTotals(3)).toBe(true)
})
