import { describe, expect, test } from 'bun:test'
import { mulberry32 } from './prng'

const firstTen = (seed: number) => {
  const next = mulberry32(seed)
  return Array.from({ length: 10 }, () => next())
}

describe('mulberry32', () => {
  test('the same seed gives the same first ten values', () => {
    expect(firstTen(20261030)).toEqual(firstTen(20261030))
  })

  test('different seeds give different values', () => {
    expect(firstTen(1)).not.toEqual(firstTen(2))
  })

  test('every value is in [0, 1)', () => {
    for (const value of firstTen(42)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
