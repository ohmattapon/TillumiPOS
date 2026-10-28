import { describe, expect, test } from 'bun:test'
import { appliedRedeemPoints, maxRedeemPoints } from './points'

const rule = { earnSatang: 1000, redeemSatang: 100, minRedeem: 10 }

describe('maxRedeemPoints', () => {
  test('max button uses maxRedeemable of the payable amount', () => {
    // 400 baht to pay, 1 baht a point, and the member holds far more than the bill needs.
    expect(maxRedeemPoints(40_000, 500, rule)).toBe(400)
  })

  test('the balance caps the bill when the member has fewer points than it needs', () => {
    expect(maxRedeemPoints(40_000, 120, rule)).toBe(120)
  })

  test('a maximum below the shop minimum is nothing, so the button never fills a refused amount', () => {
    expect(maxRedeemPoints(500, 500, rule)).toBe(0)
  })

  test('a cart with nothing to pay redeems nothing', () => {
    expect(maxRedeemPoints(0, 500, rule)).toBe(0)
  })
})

describe('appliedRedeemPoints', () => {
  test('a request inside the rules is taken as it is', () => {
    expect(appliedRedeemPoints(150, 40_000, 500, rule)).toBe(150)
  })

  test('an amount below the minimum is ignored rather than refused', () => {
    expect(appliedRedeemPoints(9, 40_000, 500, rule)).toBe(0)
  })

  test('an amount the balance cannot cover is ignored', () => {
    expect(appliedRedeemPoints(600, 40_000, 500, rule)).toBe(0)
  })

  test('an amount the bill cannot absorb is ignored', () => {
    expect(appliedRedeemPoints(401, 40_000, 500, rule)).toBe(0)
  })

  test('no request is no discount', () => {
    expect(appliedRedeemPoints(0, 40_000, 500, rule)).toBe(0)
  })
})
