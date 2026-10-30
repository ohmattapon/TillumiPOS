import { expect, test } from 'bun:test'
import { createSlotClaims } from './slot-claims'

test('slots are handed out from 0, one per claim, up to the capacity', () => {
  const claims = createSlotClaims({ checkout: 3 })
  expect([claims.claim('checkout'), claims.claim('checkout'), claims.claim('checkout')]).toEqual([{ slot: 0 }, { slot: 1 }, { slot: 2 }])
})

test('a claim beyond the capacity is refused, and stays refused', () => {
  const claims = createSlotClaims({ qr: 1 })
  expect(claims.claim('qr')).toEqual({ slot: 0 })
  expect(claims.claim('qr')).toEqual({ refused: 'full' })
  expect(claims.claim('qr')).toEqual({ refused: 'full' })
})

test('each scenario counts on its own', () => {
  const claims = createSlotClaims({ checkout: 2, orders: 2, members: 20 })
  expect(claims.claim('checkout')).toEqual({ slot: 0 })
  expect(claims.claim('orders')).toEqual({ slot: 0 })
  expect(claims.claim('checkout')).toEqual({ slot: 1 })
  expect(claims.claim('members')).toEqual({ slot: 0 })
  expect(claims.claim('orders')).toEqual({ slot: 1 })
})

test('a scenario the run did not allot is unknown', () => {
  expect(createSlotClaims({ checkout: 1 }).claim('stock')).toEqual({ refused: 'unknown' })
})

test('a capacity that is not a positive whole number is refused when the claims are made', () => {
  expect(() => createSlotClaims({ checkout: 0 })).toThrow()
  expect(() => createSlotClaims({ checkout: 1.5 })).toThrow()
})
