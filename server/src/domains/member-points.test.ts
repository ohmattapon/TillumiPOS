import { describe, expect, test } from 'bun:test'
import {
  assertRedeemable, assertValidPointsRule, maxRedeemable, pointsDiscountSatang, pointsEarned, voidEarnPoints,
  type PointsRule,
} from './member-points'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const paramsOf = (action: () => unknown): Record<string, unknown> | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { params?: Record<string, unknown> }).params
  }
  return undefined
}

const rule = (overrides: Partial<PointsRule> = {}): PointsRule => ({
  earnSatang: 2500, redeemSatang: 100, minRedeem: 10, ...overrides,
})

describe('assertValidPointsRule', () => {
  test('accepts a rule a shop can use', () => {
    expect(() => assertValidPointsRule(rule())).not.toThrow()
  })

  test('rejects an earn rate under one baht', () => {
    expect(codeOf(() => assertValidPointsRule(rule({ earnSatang: 99 })))).toBe('INVALID_SETTINGS')
  })

  test('rejects a redeem rate under one satang', () => {
    expect(codeOf(() => assertValidPointsRule(rule({ redeemSatang: 0 })))).toBe('INVALID_SETTINGS')
  })

  test('rejects a minimum of no points', () => {
    expect(codeOf(() => assertValidPointsRule(rule({ minRedeem: 0 })))).toBe('INVALID_SETTINGS')
  })

  test('rejects a rate that is not a whole number', () => {
    expect(codeOf(() => assertValidPointsRule(rule({ earnSatang: 25.5 })))).toBe('INVALID_SETTINGS')
  })
})

describe('pointsEarned', () => {
  test('counts one point per full step of what was paid', () => {
    expect(pointsEarned(9999, rule())).toBe(3)
    expect(pointsEarned(10000, rule())).toBe(4)
  })

  test('gives nothing for a bill under one step', () => {
    expect(pointsEarned(2499, rule())).toBe(0)
  })

  test('never gives a negative number', () => {
    expect(pointsEarned(-500, rule())).toBe(0)
  })
})

describe('maxRedeemable', () => {
  test('stops at the balance', () => {
    expect(maxRedeemable(100000, 25, rule())).toBe(25)
  })

  test('stops at what the bill can pay', () => {
    expect(maxRedeemable(500, 100, rule())).toBe(5)
  })

  test('gives nothing when the member has no points', () => {
    expect(maxRedeemable(100000, 0, rule())).toBe(0)
  })
})

describe('pointsDiscountSatang', () => {
  test('turns each point into its satang value', () => {
    expect(pointsDiscountSatang(12, rule())).toBe(1200)
  })
})

describe('assertRedeemable', () => {
  test('lets a bill go without points', () => {
    expect(() => assertRedeemable(0, 10000, 50, rule())).not.toThrow()
  })

  test('lets a member spend exactly the bill', () => {
    expect(() => assertRedeemable(50, 5000, 50, rule())).not.toThrow()
  })

  test('refuses one point under the minimum', () => {
    expect(codeOf(() => assertRedeemable(9, 10000, 50, rule()))).toBe('POINTS_REDEEM_INVALID')
    expect(paramsOf(() => assertRedeemable(9, 10000, 50, rule()))).toEqual({ min: 10, max: 50 })
  })

  test('refuses more than the bill can pay', () => {
    expect(codeOf(() => assertRedeemable(6, 500, 50, rule()))).toBe('POINTS_REDEEM_INVALID')
    expect(paramsOf(() => assertRedeemable(6, 500, 50, rule()))).toEqual({ min: 10, max: 5 })
  })

  test('says so when the member does not have the points', () => {
    expect(codeOf(() => assertRedeemable(30, 100000, 20, rule()))).toBe('POINTS_NOT_ENOUGH')
    expect(paramsOf(() => assertRedeemable(30, 100000, 20, rule()))).toEqual({ balance: 20 })
  })

  test('refuses a negative number of points', () => {
    expect(codeOf(() => assertRedeemable(-5, 10000, 50, rule()))).toBe('POINTS_REDEEM_INVALID')
  })
})

describe('voidEarnPoints', () => {
  test('takes back what is still there and reports the rest', () => {
    expect(voidEarnPoints(40, 15)).toEqual({ points: -15, shortfall: 25 })
  })

  test('takes back everything when the balance covers it', () => {
    expect(voidEarnPoints(10, 40)).toEqual({ points: -10, shortfall: 0 })
  })
})
