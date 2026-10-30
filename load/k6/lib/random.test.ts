import { describe, expect, test } from 'bun:test'
import { vuRandom } from './random'

const take = (next: () => number) => Array.from({ length: 5 }, () => next())

describe('vuRandom', () => {
  test('repeats for the same scenario and user', () => {
    expect(take(vuRandom('checkout', 2))).toEqual(take(vuRandom('checkout', 2)))
  })

  test('differs between users and between scenarios', () => {
    expect(take(vuRandom('checkout', 2))).not.toEqual(take(vuRandom('checkout', 3)))
    expect(take(vuRandom('checkout', 2))).not.toEqual(take(vuRandom('orders', 2)))
  })
})
