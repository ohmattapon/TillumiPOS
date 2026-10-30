import { describe, expect, test } from 'bun:test'
import { idempotencyKeyFor } from './keys'

// The API accepts a UUID of version 1 to 8 with the variant bits 8, 9, a or b.
const API_KEY_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('idempotencyKeyFor', () => {
  test('is a UUID the API accepts', () => {
    expect(idempotencyKeyFor('checkout', 3, 12, 'sale')).toMatch(API_KEY_SHAPE)
  })

  test('is the same for the same scenario, vu, iteration and step', () => {
    expect(idempotencyKeyFor('checkout', 3, 12, 'sale')).toBe(idempotencyKeyFor('checkout', 3, 12, 'sale'))
  })

  test('differs when any part differs', () => {
    const keys = new Set([
      idempotencyKeyFor('checkout', 3, 12, 'sale'),
      idempotencyKeyFor('orders', 3, 12, 'sale'),
      idempotencyKeyFor('checkout', 4, 12, 'sale'),
      idempotencyKeyFor('checkout', 3, 13, 'sale'),
      idempotencyKeyFor('checkout', 3, 12, 'open-shift'),
    ])
    expect(keys.size).toBe(5)
  })

  test('does not repeat over many iterations', () => {
    const keys = new Set<string>()
    for (let vu = 1; vu <= 10; vu++) for (let iter = 0; iter < 2000; iter++) keys.add(idempotencyKeyFor('checkout', vu, iter, 'sale'))
    expect(keys.size).toBe(20_000)
  })
})
