import { expect, test } from 'bun:test'
import { promotionRulesOfAll } from './promotion-rules'

// The shape the API returned before the coupon, bundle and limit fields arrive (Task 2 adds them).
const beforeTask2 = {
  id: 1, name: 'ลด 10%', kind: 'percent' as const, value: 1000, maxDiscountSatang: 100, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone' as const, isActive: true, scope: null, imageUrl: null,
  createdAt: new Date('2026-10-15T12:00:00Z'), updatedAt: new Date('2026-10-15T12:00:00Z'),
}

test('a promotion the API has not given the new fields yet is completed with nulls', () => {
  const [rules] = promotionRulesOfAll([beforeTask2])

  expect(rules).toMatchObject({
    id: 1, name: 'ลด 10%', kind: 'percent', value: 1000,
    couponCode: null, buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null,
  })
})
