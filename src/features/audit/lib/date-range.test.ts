import { describe, expect, test } from 'bun:test'
import { isRangeInOrder } from './date-range'

describe('isRangeInOrder', () => {
  test('the end may not come before the start, and the same day is fine', () => {
    expect(isRangeInOrder('2026-10-01', '2026-10-15')).toBe(true)
    expect(isRangeInOrder('2026-10-15', '2026-10-15')).toBe(true)
    expect(isRangeInOrder('2026-10-16', '2026-10-15')).toBe(false)
  })

  test('a range with one end or none has nothing to compare', () => {
    expect(isRangeInOrder('', '2026-10-15')).toBe(true)
    expect(isRangeInOrder('2026-10-15', '')).toBe(true)
    expect(isRangeInOrder('', '')).toBe(true)
  })

  test('compares years, not just the days of the month', () => {
    expect(isRangeInOrder('2025-12-31', '2026-01-01')).toBe(true)
    expect(isRangeInOrder('2026-01-01', '2025-12-31')).toBe(false)
  })
})
