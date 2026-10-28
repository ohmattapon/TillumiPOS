import { describe, expect, test } from 'bun:test'
import {
  evaluatePromotion, hasUsesLeft, pickBestPromotion, promotionsFor, PromotionEntity,
  type PromotionCandidate, type PromotionContext,
} from './promotion.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const rules = (overrides: Partial<PromotionCandidate> = {}): PromotionCandidate => ({
  id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
  startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
  audience: 'everyone', isActive: true, scope: null,
  couponCode: null, buyQuantity: null, freeQuantity: null, maxUses: null, maxUsesPerMember: null,
  ...overrides,
})
const context = (overrides: Partial<PromotionContext> = {}): PromotionContext => ({
  subtotalSatang: 10000, hasMember: false, at: new Date('2026-10-15T03:00:00Z'), timeZone: 'Asia/Bangkok', lines: [], couponCode: null, ...overrides,
})
const line = (productId: number, categoryId: number | null, unitPriceSatang: number, quantity: number, isPack = false) => ({
  productId, categoryId, unitPriceSatang, quantity, isPack, lineTotalSatang: unitPriceSatang * quantity,
})
const discount = (r: PromotionCandidate, c: PromotionContext) => {
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

describe('scoped to products and categories', () => {
  // A 100-baht bill: 60 baht of coffee (category 1) and 40 baht of cake (category 2).
  const bill = context({
    subtotalSatang: 10000,
    lines: [line(10, 1, 6000, 1), line(20, 2, 4000, 1)],
  })

  test('a percent promotion counts only the lines in its scope', () => {
    expect(discount(rules({ value: 1000, scope: { productIds: [20], categoryIds: [] } }), bill)).toBe(400)
    expect(discount(rules({ value: 1000, scope: { productIds: [], categoryIds: [1] } }), bill)).toBe(600)
  })

  test('a line matches by its product or by its category, and is counted once', () => {
    expect(discount(rules({ value: 1000, scope: { productIds: [10], categoryIds: [1, 2] } }), bill)).toBe(1000)
  })

  test('a fixed promotion gives at most the total of the lines in its scope', () => {
    expect(discount(rules({ kind: 'fixed', value: 5000, scope: { productIds: [20], categoryIds: [] } }), bill)).toBe(4000)
    expect(discount(rules({ kind: 'fixed', value: 500, scope: { productIds: [20], categoryIds: [] } }), bill)).toBe(500)
  })

  test('the cap still applies to a scoped percent promotion', () => {
    expect(discount(rules({ value: 5000, maxDiscountSatang: 1000, scope: { productIds: [], categoryIds: [1] } }), bill)).toBe(1000)
  })

  test('no line in its scope means it does not apply', () => {
    expect(evaluatePromotion(rules({ scope: { productIds: [99], categoryIds: [7] } }), bill)).toEqual({ eligible: false })
    expect(evaluatePromotion(rules({ scope: { productIds: [10], categoryIds: [] } }), context({ lines: [] }))).toEqual({ eligible: false })
  })

  test('a line with no category matches only by product', () => {
    const uncategorised = context({ lines: [line(30, null, 10000, 1)] })
    expect(evaluatePromotion(rules({ scope: { productIds: [], categoryIds: [1] } }), uncategorised)).toEqual({ eligible: false })
    expect(discount(rules({ scope: { productIds: [30], categoryIds: [] } }), uncategorised)).toBe(1000)
  })

  test('the minimum is still compared with the whole bill', () => {
    const scoped = rules({ value: 1000, minSubtotalSatang: 8000, scope: { productIds: [20], categoryIds: [] } })
    expect(discount(scoped, bill)).toBe(400)
    expect(discount(scoped, context({ ...bill, subtotalSatang: 7999 }))).toBeNull()
  })

  test('no scope is the whole bill, whatever lines are given', () => {
    expect(discount(rules({ value: 1000 }), bill)).toBe(1000)
  })

  test('the best promotion compares scoped and whole-bill discounts on what each gives', () => {
    const wholeBill = rules({ id: 2, kind: 'fixed', value: 500 })
    const coffee = rules({ id: 3, value: 1000, scope: { productIds: [], categoryIds: [1] } })
    expect(pickBestPromotion([wholeBill, coffee], bill)?.promotion.id).toBe(3)
    expect(pickBestPromotion([wholeBill, rules({ id: 4, value: 1000, scope: { productIds: [20], categoryIds: [] } })], bill)?.promotion.id).toBe(2)
  })
})

describe('the promotions a product is part of', () => {
  const at = new Date('2026-10-15T03:00:00Z') // Thursday 10:00 in Bangkok
  const coffee: { productId: number; categoryId: number | null } = { productId: 10, categoryId: 1 }
  const find = (promotions: PromotionCandidate[], item = coffee) => promotionsFor(promotions, item, at, 'Asia/Bangkok').map((p) => p.id)

  test('lists the running promotions scoped to the product or its category, in id order', () => {
    expect(find([
      rules({ id: 3, scope: { productIds: [], categoryIds: [1] } }),
      rules({ id: 2, scope: { productIds: [10], categoryIds: [] } }),
      rules({ id: 4, scope: { productIds: [20], categoryIds: [2] } }),
    ])).toEqual([2, 3])
  })

  test('leaves out whole-bill promotions, which are not about this product', () => {
    expect(find([rules({ id: 1 })])).toEqual([])
  })

  test('leaves out what is switched off or not running now', () => {
    const scope = { productIds: [10], categoryIds: [] }
    expect(find([
      rules({ id: 1, scope, isActive: false }),
      rules({ id: 2, scope, weekdays: [1] }),
      rules({ id: 3, scope, windowStartMinute: 14 * 60, windowEndMinute: 17 * 60 }),
      rules({ id: 4, scope, endsOn: '2026-10-14' }),
    ])).toEqual([])
  })

  test('keeps a promotion the cart does not qualify for yet, so the cashier can mention it', () => {
    const scope = { productIds: [10], categoryIds: [] }
    expect(find([rules({ id: 1, scope, minSubtotalSatang: 50000 }), rules({ id: 2, scope, audience: 'members' })])).toEqual([1, 2])
  })

  test('a product with no category matches by product only', () => {
    expect(find([rules({ id: 1, scope: { productIds: [], categoryIds: [1] } })], { productId: 10, categoryId: null })).toEqual([])
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

  test('sorts and dedupes the scope, and an empty scope is the whole bill', () => {
    const scoped = new PromotionEntity({ ...props, scope: { productIds: [5, 3, 5], categoryIds: [2, 2] } })
    expect(scoped.scope).toEqual({ productIds: [3, 5], categoryIds: [2] })
    expect(new PromotionEntity({ ...props, scope: { productIds: [], categoryIds: [] } }).scope).toBeNull()
    expect(scoped.toSnapshot().scope).toEqual({ productIds: [3, 5], categoryIds: [2] })
  })

  test('rejects a scope that is not positive whole ids or is too long', () => {
    invalid({ scope: { productIds: [0], categoryIds: [] } })
    invalid({ scope: { productIds: [], categoryIds: [-1] } })
    invalid({ scope: { productIds: [1.5], categoryIds: [] } })
    invalid({ scope: { productIds: Array.from({ length: 501 }, (_, index) => index + 1), categoryIds: [] } })
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

describe('coupons and bundles', () => {
  test('a coupon promotion applies only with its code', () => {
    const coupon = rules({ kind: 'fixed', value: 500, couponCode: 'SUMMER10' })
    expect(evaluatePromotion(coupon, context())).toEqual({ eligible: false })
    // The typed code is matched after it is trimmed and upper-cased.
    expect(discount(coupon, context({ couponCode: 'summer10 ' }))).toBe(500)
    expect(evaluatePromotion(coupon, context({ couponCode: 'OTHER' }))).toEqual({ eligible: false })
  })

  test('an automatic promotion that gives more beats the coupon', () => {
    const automatic = rules({ id: 1, kind: 'fixed', value: 900 })
    const coupon = rules({ id: 2, kind: 'fixed', value: 500, couponCode: 'SUMMER10' })
    expect(pickBestPromotion([automatic, coupon], context({ couponCode: 'SUMMER10' }))?.promotion.id).toBe(1)
  })

  test('buy 2 get 1 frees the cheapest of each full group', () => {
    // 55, 50, 50, 45, 40 baht: the first group of three frees one 50-baht item, the second is short.
    const group = (price: number) => line(10, 1, price, 1)
    const lines = [group(5500), group(5000), group(5000), group(4500), group(4000)]
    const bundle = rules({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
    expect(discount(bundle, context({ subtotalSatang: 24000, lines }))).toBe(5000)
  })

  test('pack lines do not count toward a bundle', () => {
    const bundle = rules({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
    // Two 50-baht units plus a pack line that owns twelve bottles: the pack adds no unit, so no group forms.
    expect(evaluatePromotion(bundle, context({ subtotalSatang: 10000, lines: [line(10, 1, 5000, 2), line(10, 1, 3000, 12, true)] }))).toEqual({ eligible: false })
    // The group is made from piece lines only: two 50s fill with a 30 and free the cheapest, 30 baht. A 45-baht pack line counts neither as one line nor as twelve units, or the freed item would be the 45.
    expect(discount(bundle, context({ subtotalSatang: 17500, lines: [line(10, 1, 5000, 2), line(10, 1, 3000, 1), line(10, 1, 4500, 12, true)] }))).toBe(3000)
  })

  test('an incomplete first group is not eligible', () => {
    const bundle = rules({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
    expect(evaluatePromotion(bundle, context({ lines: [line(10, 1, 5500, 1), line(10, 1, 5000, 1)] }))).toEqual({ eligible: false })
  })

  test('maxDiscountSatang caps a bundle', () => {
    const bundle = rules({
      kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, maxDiscountSatang: 2000, scope: { productIds: [10], categoryIds: [] },
    })
    expect(discount(bundle, context({ lines: [line(10, 1, 5000, 3)] }))).toBe(2000)
  })

  test('bundle of 9999 units', () => {
    const bundle = rules({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
    const lines = [line(10, 1, 1000, 9999)]
    const started = performance.now()
    const given = discount(bundle, context({ subtotalSatang: 9_999_000, lines }))
    const elapsed = performance.now() - started
    expect(given).toBe(3_333_000)
    expect(elapsed).toBeLessThan(50)
  })

  test('a coupon promotion with no code typed is not eligible even when every other rule passes', () => {
    // The member-only and minimum checks must not swallow the coupon question with their own reasons.
    const coupon = rules({ audience: 'members', minSubtotalSatang: 5000, couponCode: 'SUMMER10' })
    expect(evaluatePromotion(coupon, context({ hasMember: true }))).toEqual({ eligible: false })
  })

  describe('the entity carries the new fields', () => {
    const props = {
      ...rules(), name: 'ลดโปร', imageKey: null, createdAt: new Date('2026-10-15T00:00:00Z'), updatedAt: new Date('2026-10-15T00:00:00Z'),
    }
    const ea = (changes: Partial<typeof props> = {}) => new PromotionEntity({ ...props, ...changes })

    test('normalizes the coupon code and keeps it through with()', () => {
      const entity = ea({ couponCode: ' summer10 ' })
      expect(entity.couponCode).toBe('SUMMER10')
      expect(entity.with({}, new Date('2026-10-16T00:00:00Z')).couponCode).toBe('SUMMER10')
      expect(ea().couponCode).toBeNull()
      const code = ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] }, couponCode: 'x2-for-1' })
      expect(code.couponCode).toBe('X2-FOR-1')
    })

    test('a bundle without a scope, or without both quantities, is refused', () => {
      expect(codeOf(() => ea({ kind: 'bundle', value: 0 }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [], categoryIds: [] } }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ kind: 'bundle', value: 0, buyQuantity: 2, scope: { productIds: [10], categoryIds: [] } }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ kind: 'bundle', value: 0, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } }))).toBe('INVALID_PROMOTION')
      expect(ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } }).kind).toBe('bundle')
    })

    test('bundle quantities and limits stay inside their bounds', () => {
      const bundle = { kind: 'bundle' as const, value: 0, scope: { productIds: [10], categoryIds: [] } }
      expect(codeOf(() => ea({ ...bundle, buyQuantity: 0, freeQuantity: 1 }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ ...bundle, buyQuantity: 100, freeQuantity: 1 }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ ...bundle, buyQuantity: 2, freeQuantity: 1.5 }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ ...bundle, buyQuantity: 2.5, freeQuantity: 1 }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ maxUses: 0 }))).toBe('INVALID_PROMOTION')
      expect(ea({ maxUses: 1 }).maxUses).toBe(1)
      expect(ea().maxUses).toBeNull()
    })

    test('a code that fails the pattern is refused', () => {
      expect(codeOf(() => ea({ couponCode: 'ab' }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ couponCode: 'HAS SPACE' }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ couponCode: 'x'.repeat(21) }))).toBe('INVALID_PROMOTION')
      expect(codeOf(() => ea({ couponCode: 'ตัวอักษร' }))).toBe('INVALID_PROMOTION')
    })

    test('a per-member limit belongs to a members-only promotion', () => {
      expect(codeOf(() => ea({ maxUsesPerMember: 1 }))).toBe('INVALID_PROMOTION')
      expect(ea({ audience: 'members', maxUsesPerMember: 2 }).maxUsesPerMember).toBe(2)
    })

    test('a slot is spent only when the count reaches the limit it is asked against', () => {
      expect(hasUsesLeft({ maxUses: 3, maxUsesPerMember: null }, { total: 2, byMember: 0 }, false)).toBe(true)
      expect(hasUsesLeft({ maxUses: 3, maxUsesPerMember: null }, { total: 3, byMember: 0 }, false)).toBe(false)
      // A promotion with no limit always has a slot, whatever was counted.
      expect(hasUsesLeft({ maxUses: null, maxUsesPerMember: null }, { total: 99, byMember: 0 }, false)).toBe(true)
      // The per-member limit counts only the member at hand: an empty member leaves it alone.
      expect(hasUsesLeft({ maxUses: null, maxUsesPerMember: 2 }, { total: 99, byMember: 2 }, false)).toBe(true)
      expect(hasUsesLeft({ maxUses: null, maxUsesPerMember: 2 }, { total: 99, byMember: 2 }, true)).toBe(false)
      expect(hasUsesLeft({ maxUses: null, maxUsesPerMember: 2 }, { total: 99, byMember: 1 }, true)).toBe(true)
    })

    test('isExhausted answers the total limit only', () => {
      expect(ea({ maxUses: 3 }).isExhausted(2)).toBe(false)
      expect(ea({ maxUses: 3 }).isExhausted(3)).toBe(true)
      expect(ea({ maxUses: null, maxUsesPerMember: 1, audience: 'members' as const }).isExhausted(99)).toBe(false)
    })

    test('a bundle may set value 0, and the cap applies to a bundle too', () => {
      const bundle = ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
      expect(bundle.value).toBe(0)
      expect(ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] }, maxDiscountSatang: 100 }).value).toBe(0)
      expect(codeOf(() => ea({ kind: 'bundle', value: -0.5, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } }))).toBe('INVALID_PROMOTION')
    })

    test('toSalePromotion carries the coupon code, and a bundle carries its quantities', () => {
      expect(ea({ couponCode: 'SUMMER10' }).toSalePromotion(100)).toEqual({
        id: 1, name: 'ลดโปร', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 100, couponCode: 'SUMMER10',
      })
      const bundle = ea({ kind: 'bundle', value: 0, buyQuantity: 2, freeQuantity: 1, scope: { productIds: [10], categoryIds: [] } })
      expect(bundle.toSalePromotion(500)).toEqual({
        id: 1, name: 'ลดโปร', kind: 'bundle', value: 0, maxDiscountSatang: null, discountSatang: 500, buyQuantity: 2, freeQuantity: 1,
      })
    })
  })
})
