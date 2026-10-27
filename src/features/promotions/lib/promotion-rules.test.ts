import { expect, test } from 'bun:test'
import { promotionRulesOfAll } from './promotion-rules'

// The shape the API returns, with the limits a promotion does not use answered as null.
const fixture = {
  id: 1, name: 'ลด 10%', kind: 'percent' as const, value: 1000, maxDiscountSatang: 100, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone' as const, isActive: true, scope: null, imageUrl: null,
  couponCode: null, buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null,
  createdAt: new Date('2026-10-15T12:00:00Z'), updatedAt: new Date('2026-10-15T12:00:00Z'),
}

test('a promotion the API has not given the new fields yet is completed with nulls', () => {
  const [rules] = promotionRulesOfAll([fixture])

  expect(rules).toMatchObject({
    id: 1, name: 'ลด 10%', kind: 'percent', value: 1000,
    couponCode: null, buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null,
  })
})
