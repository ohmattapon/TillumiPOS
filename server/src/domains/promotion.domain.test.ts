import { describe, expect, test } from 'bun:test'
import {
  evaluatePromotion, pickBestPromotion, PromotionEntity,
  type PromotionContext, type PromotionRules,
} from './promotion.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const rules = (overrides: Partial<PromotionRules> = {}): PromotionRules => ({
  id: 1, kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone', isActive: true, ...overrides,
})
const context = (overrides: Partial<PromotionContext> = {}): PromotionContext => ({
  subtotalSatang: 10000, hasMember: false, at: new Date('2026-10-15T03:00:00Z'), timeZone: 'Asia/Bangkok', ...overrides,
})
const discount = (r: PromotionRules, c: PromotionContext) => {
  const result = evaluatePromotion(r, c)
  return result.eligible ? result.discountSatang : null
}

describe('discount amount', () => {
  test('a fixed promotion gives its value, never more than the subtotal', () => {
    expect(discount(rules({ kind: 'fixed', value: 500 }), context())).toBe(500)
    expect(discount(rules({ kind: 'fixed', value: 5000 }), context({ subtotalSatang: 3000 }))).toBe(3000)
  })

  test('a percent promotion rounds to the satang and stops at its cap', () => {
    expect(discount(rules({ value: 1000 }), context({ subtotalSatang: 15555 }))).toBe(1556)
    expect(discount(rules({ value: 1000, maxDiscountSatang: 1000 }), context({ subtotalSatang: 15555 }))).toBe(1000)
    expect(discount(rules({ value: 10000 }), context({ subtotalSatang: 4200 }))).toBe(4200)
  })

  test('a promotion that would give nothing is not eligible', () => {
    expect(evaluatePromotion(rules({ value: 1 }), context({ subtotalSatang: 100 }))).toEqual({ eligible: false })
    expect(evaluatePromotion(rules(), context({ subtotalSatang: 0 }))).toEqual({ eligible: false })
  })
})

describe('who and what it applies to', () => {
  test('a disabled promotion never applies', () => {
    expect(evaluatePromotion(rules({ isActive: false }), context())).toEqual({ eligible: false })
  })

  test('a members-only promotion needs a member', () => {
    const memberOnly = rules({ audience: 'members' })
    expect(evaluatePromotion(memberOnly, context({ hasMember: false }))).toEqual({ eligible: false })
    expect(discount(memberOnly, context({ hasMember: true }))).toBe(1000)
  })

  test('the minimum is compared with the subtotal before discount', () => {
    const minimum = rules({ minSubtotalSatang: 10000 })
    expect(discount(minimum, context({ subtotalSatang: 9999 }))).toBeNull()
    expect(discount(minimum, context({ subtotalSatang: 10000 }))).toBe(1000)
  })
})

describe('when it applies, in the shop time zone', () => {
  test('the end date is included to the last minute of that day', () => {
    const ends = rules({ endsOn: '2026-10-15' })
    expect(discount(ends, context({ at: new Date('2026-10-15T16:59:00Z') }))).toBe(1000) // 23:59 Bangkok
    expect(discount(ends, context({ at: new Date('2026-10-15T17:00:00Z') }))).toBeNull() // 00:00 next day
  })

  test('the start date opens at midnight of the shop, not of UTC', () => {
    const starts = rules({ startsOn: '2026-10-15' })
    expect(discount(starts, context({ at: new Date('2026-10-14T16:59:00Z') }))).toBeNull() // 23:59 on the 14th
    expect(discount(starts, context({ at: new Date('2026-10-14T17:00:00Z') }))).toBe(1000) // 00:00 on the 15th
  })

  test('weekdays name the days it applies on (0 = Sunday)', () => {
    const thursdays = rules({ weekdays: [4] })
    expect(discount(thursdays, context())).toBe(1000)
    expect(discount(rules({ weekdays: [1, 2] }), context())).toBeNull()
  })

  test('a time window is half open: its start is inside, its end is outside', () => {
    const lunch = rules({ windowStartMinute: 11 * 60, windowEndMinute: 14 * 60 })
    expect(discount(lunch, context({ at: new Date('2026-10-15T04:00:00Z') }))).toBe(1000) // 11:00
    expect(discount(lunch, context({ at: new Date('2026-10-15T06:59:00Z') }))).toBe(1000) // 13:59
    expect(discount(lunch, context({ at: new Date('2026-10-15T07:00:00Z') }))).toBeNull() // 14:00
    expect(discount(lunch, context({ at: new Date('2026-10-15T03:59:00Z') }))).toBeNull() // 10:59
  })

  test('a window across midnight belongs to the weekday it started on', () => {
    // Fridays 22:00-02:00. 2026-10-16 is a Friday, 2026-10-17 a Saturday.
    const lateFriday = rules({ weekdays: [5], windowStartMinute: 22 * 60, windowEndMinute: 2 * 60 })
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T15:30:00Z') }))).toBe(1000) // Fri 22:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T18:30:00Z') }))).toBe(1000) // Sat 01:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-16T19:30:00Z') }))).toBeNull() // Sat 02:30
    expect(discount(lateFriday, context({ at: new Date('2026-10-17T15:30:00Z') }))).toBeNull() // Sat 22:30
  })

  test('a window across midnight uses the start day for the dates too', () => {
    const lastNight = rules({ endsOn: '2026-10-15', windowStartMinute: 22 * 60, windowEndMinute: 2 * 60 })
    expect(discount(lastNight, context({ at: new Date('2026-10-15T18:30:00Z') }))).toBe(1000) // 01:30 on the 16th, started on the 15th
    expect(discount(lastNight, context({ at: new Date('2026-10-16T15:30:00Z') }))).toBeNull() // 22:30 on the 16th
  })
})

describe('choosing the best', () => {
  test('the biggest discount wins and a tie goes to the lowest id', () => {
    const small = rules({ id: 3, kind: 'fixed', value: 500 })
    const big = rules({ id: 5, kind: 'fixed', value: 900 })
    const sameAsBig = rules({ id: 4, kind: 'fixed', value: 900 })
    expect(pickBestPromotion([small, big, sameAsBig], context())).toEqual({ promotion: sameAsBig, discountSatang: 900 })
  })

  test('none eligible is null', () => {
    expect(pickBestPromotion([rules({ isActive: false })], context())).toBeNull()
    expect(pickBestPromotion([], context())).toBeNull()
  })
})

describe('PromotionEntity', () => {
  const props = {
    ...rules(), name: '  ลดวันพฤหัส  ', imageKey: null, createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
  }
  const invalid = (changes: Partial<typeof props>) =>
    expect(codeOf(() => new PromotionEntity({ ...props, ...changes }))).toBe('INVALID_PROMOTION')

  test('trims the name and turns an empty weekday list into every day', () => {
    const entity = new PromotionEntity({ ...props, weekdays: [] })
    expect(entity.name).toBe('ลดวันพฤหัส')
    expect(entity.weekdays).toBeNull()
  })

  test('sorts weekdays and drops repeats', () => {
    expect(new PromotionEntity({ ...props, weekdays: [5, 1, 5, 0] }).weekdays).toEqual([0, 1, 5])
  })

  test('carries the image key through snapshots, and with() never changes it', () => {
    const entity = new PromotionEntity({ ...props, imageKey: 'promotions/7/a.png' })
    expect(entity.imageKey).toBe('promotions/7/a.png')
    expect(entity.toSnapshot().imageKey).toBe('promotions/7/a.png')
    const renamed = entity.with({ name: 'ชื่อใหม่' }, new Date('2026-10-16T00:00:00Z'))
    expect(renamed.imageKey).toBe('promotions/7/a.png')
    const smuggled = entity.with({ name: 'ชื่อใหม่', imageKey: 'promotions/7/evil.png' }, new Date('2026-10-16T00:00:00Z'))
    expect(smuggled.imageKey).toBe('promotions/7/a.png')
  })

  test('rejects values outside what each kind allows', () => {
    invalid({ name: '   ' })
    invalid({ name: 'x'.repeat(81) })
    invalid({ kind: 'percent', value: 0 })
    invalid({ kind: 'percent', value: 10001 })
    invalid({ kind: 'fixed', value: 0 })
    invalid({ kind: 'fixed', value: 2_147_483_648 })
    invalid({ value: 10.5 })
  })

  test('a cap belongs to percent promotions only and must be positive', () => {
    invalid({ kind: 'fixed', value: 500, maxDiscountSatang: 100 })
    invalid({ maxDiscountSatang: 0 })
    expect(new PromotionEntity({ ...props, maxDiscountSatang: 100 }).maxDiscountSatang).toBe(100)
  })

  test('rejects an impossible calendar, weekday or window', () => {
    invalid({ startsOn: '2026-02-30' })
    invalid({ endsOn: '15/10/2026' })
    invalid({ startsOn: '2026-10-16', endsOn: '2026-10-15' })
    invalid({ weekdays: [7] })
    invalid({ weekdays: [-1] })
    invalid({ windowStartMinute: 600, windowEndMinute: null })
    invalid({ windowStartMinute: 600, windowEndMinute: 600 })
    invalid({ windowStartMinute: 1440, windowEndMinute: 10 })
    invalid({ minSubtotalSatang: -1 })
  })

  test('`with` changes only what is given, keeps null as a value, and validates the result', () => {
    const entity = new PromotionEntity({ ...props, maxDiscountSatang: 100, startsOn: '2026-10-01' })
    const later = new Date('2026-10-16T00:00:00Z')
    const changed = entity.with({ endsOn: '2026-10-31', startsOn: null }, later)
    expect(changed).toMatchObject({ endsOn: '2026-10-31', startsOn: null, maxDiscountSatang: 100, updatedAt: later })
    expect(changed.createdAt).toEqual(entity.createdAt)
    expect(codeOf(() => entity.with({ kind: 'fixed' }, later))).toBe('INVALID_PROMOTION')
  })

  test('toSalePromotion snapshots the rule with the discount it gave', () => {
    const entity = new PromotionEntity({ ...props, id: 9, maxDiscountSatang: 700 })
    expect(entity.toSalePromotion(650)).toEqual({
      id: 9, name: 'ลดวันพฤหัส', kind: 'percent', value: 1000, maxDiscountSatang: 700, discountSatang: 650,
    })
  })
})
