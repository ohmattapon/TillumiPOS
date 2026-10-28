import { describe, expect, test } from 'bun:test'
import { createMoney } from '@/lib/money'
import {
  bpToPercent, emptyPromotionForm, fromPromotion, minuteOf, percentToBp, timeOf, toBody, weekdayName,
  type PromotionForm,
} from './promotion-form'

const baht = createMoney('THB', 'th')
const form = (overrides: Partial<PromotionForm> = {}): PromotionForm => ({
  ...emptyPromotionForm, name: 'ลดเปิดร้าน', kind: 'percent', value: '10', ...overrides,
})

describe('percent and basis points', () => {
  test.each([['10', 1000], ['12.5', 1250], ['0.01', 1], ['100', 10000], [' 7 ', 700], ['0.5', 50]])(
    '%p is %p basis points', (input, bp) => expect(percentToBp(input)).toBe(bp),
  )

  test.each(['0', '100.01', '1.234', '-5', 'abc', '', '1,5'])('%p is not a percent', (input) =>
    expect(percentToBp(input)).toBeNull(),
  )

  test('goes back to the text that was typed', () => {
    for (const bp of [1, 50, 1000, 1250, 9999, 10000]) expect(percentToBp(bpToPercent(bp))).toBe(bp)
    expect(bpToPercent(1250)).toBe('12.5')
    expect(bpToPercent(1000)).toBe('10')
  })
})

describe('time of day', () => {
  test('reads HH:MM into minutes and back', () => {
    expect(minuteOf('22:30')).toBe(1350)
    expect(minuteOf('00:00')).toBe(0)
    expect(timeOf(1350)).toBe('22:30')
    expect(timeOf(120)).toBe('02:00')
  })

  test.each(['24:00', '9:00', '12:60', '', 'noon'])('%p is not a time', (input) => expect(minuteOf(input)).toBeNull())
})

describe('weekday names', () => {
  test('0 is Sunday in either language', () => {
    expect(weekdayName('en', 0)).toBe('Sun')
    expect(weekdayName('en', 6)).toBe('Sat')
    expect(weekdayName('th', 0)).toContain('อา')
  })
})

describe('toBody', () => {
  test('a percent promotion in basis points, with a cap in satang', () => {
    const result = toBody(form({ value: '12.5', maxDiscount: '100', minSubtotal: '300' }), baht)
    expect(result).toEqual({
      ok: true,
      body: {
        name: 'ลดเปิดร้าน', kind: 'percent', value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000,
        buyQuantity: null, freeQuantity: null, couponCode: null, maxUses: null, maxUsesPerMember: null,
        startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
        audience: 'everyone', isActive: true,
      },
    })
  })

  test('a fixed promotion is in satang and drops a cap that was typed before the kind changed', () => {
    const result = toBody(form({ kind: 'fixed', value: '20', maxDiscount: '50' }), baht)
    expect(result.ok && result.body).toMatchObject({ kind: 'fixed', value: 2000, maxDiscountSatang: null })
  })

  test('weekdays are sorted, and none chosen means every day', () => {
    expect(toBody(form({ weekdays: [5, 1, 0] }), baht)).toMatchObject({ ok: true, body: { weekdays: [0, 1, 5] } })
    expect(toBody(form({ weekdays: [] }), baht)).toMatchObject({ ok: true, body: { weekdays: null } })
  })

  test('a window has both ends, which differ, and the dates are in order', () => {
    expect(toBody(form({ windowStart: '22:00', windowEnd: '02:00' }), baht)).toMatchObject({
      ok: true, body: { windowStartMinute: 1320, windowEndMinute: 120 },
    })
    expect(toBody(form({ windowStart: '22:00' }), baht)).toEqual({ ok: false, problems: ['window'] })
    expect(toBody(form({ windowStart: '10:00', windowEnd: '10:00' }), baht)).toEqual({ ok: false, problems: ['window'] })
    expect(toBody(form({ startsOn: '2026-12-01', endsOn: '2026-11-01' }), baht)).toEqual({ ok: false, problems: ['dates'] })
  })

  test('names every problem at once', () => {
    expect(toBody(form({ name: '  ', value: '0', maxDiscount: 'x', minSubtotal: '-' }), baht)).toEqual({
      ok: false, problems: ['name', 'value', 'maxDiscount', 'minSubtotal'],
    })
  })
})

describe('fromPromotion', () => {
  test('puts a stored promotion back into what the owner would have typed', () => {
    const stored = {
      id: 3, name: 'ศุกร์ดึก', kind: 'percent' as const, value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000,
      startsOn: '2026-10-01', endsOn: null, weekdays: [5, 6], windowStartMinute: 1320, windowEndMinute: 120,
      audience: 'members' as const, isActive: false,
    }
    expect(fromPromotion(stored, baht)).toEqual({
      name: 'ศุกร์ดึก', kind: 'percent', value: '12.5', maxDiscount: '100', minSubtotal: '300',
      buyQuantity: '', freeQuantity: '', couponCode: '', maxUses: '', maxUsesPerMember: '',
      startsOn: '2026-10-01', endsOn: '', weekdays: [5, 6], windowStart: '22:00', windowEnd: '02:00',
      audience: 'members', isActive: false,
    })
    const again = toBody(fromPromotion(stored, baht), baht)
    expect(again.ok && again.body).toMatchObject({ value: 1250, maxDiscountSatang: 10000, minSubtotalSatang: 30000 })
  })
})

describe('bundles, coupons and limits', () => {
  test('a bundle form maps to buyQuantity and freeQuantity and no value', () => {
    const result = toBody(form({ kind: 'bundle', value: '20', buyQuantity: '2', freeQuantity: '1' }), baht)
    expect(result.ok && result.body).toMatchObject({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1 })
    expect(toBody(form({ kind: 'bundle', value: '', buyQuantity: '0', freeQuantity: '1' }), baht)).toEqual({
      ok: false, problems: ['buyQuantity'],
    })
    expect(toBody(form({ kind: 'bundle', value: '', buyQuantity: '2', freeQuantity: '100' }), baht)).toEqual({
      ok: false, problems: ['freeQuantity'],
    })
  })

  test('a coupon code is trimmed and upper-cased', () => {
    const result = toBody(form({ couponCode: ' summer10 ' }), baht)
    expect(result.ok && result.body.couponCode).toBe('SUMMER10')
    expect(toBody(form({ couponCode: 'ab' }), baht)).toEqual({ ok: false, problems: ['couponCode'] })
    expect(toBody(form({ couponCode: '   ' }), baht)).toMatchObject({ ok: true, body: { couponCode: null } })
  })

  test('per-member limit is dropped when the audience is everyone', () => {
    expect(toBody(form({ audience: 'members', maxUses: '50', maxUsesPerMember: '2' }), baht))
      .toMatchObject({ ok: true, body: { maxUses: 50, maxUsesPerMember: 2 } })
    expect(toBody(form({ audience: 'everyone', maxUses: '50', maxUsesPerMember: '2' }), baht))
      .toMatchObject({ ok: true, body: { maxUses: 50, maxUsesPerMember: null } })
  })
})
