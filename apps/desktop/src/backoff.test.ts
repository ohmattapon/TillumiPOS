import { describe, expect, test } from 'bun:test'
import { nextDelayMs } from './backoff'

describe('nextDelayMs', () => {
  test('starts at one second', () => {
    expect(nextDelayMs(0)).toBe(1000)
  })

  test('grows and then stops at the ten second cap', () => {
    expect(nextDelayMs(1)).toBeGreaterThan(1000)
    expect(nextDelayMs(1000)).toBe(10_000)
  })

  test('never goes down, never below one second, never above ten', () => {
    let previous = 0
    for (let attempt = 0; attempt <= 2000; attempt++) {
      const delay = nextDelayMs(attempt)
      expect(delay).toBeGreaterThanOrEqual(previous)
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThanOrEqual(10_000)
      previous = delay
    }
  })

  test('reaches the cap in a bounded number of attempts and stays there', () => {
    const firstAtCap = Array.from({ length: 50 }, (_, attempt) => attempt).find(
      (attempt) => nextDelayMs(attempt) === 10_000,
    )
    expect(firstAtCap).toBeDefined()
    expect(firstAtCap!).toBeLessThanOrEqual(10)
    expect(nextDelayMs(firstAtCap! + 100)).toBe(10_000)
  })

  test('treats a bad attempt count as the first attempt or the cap, never as a wild delay', () => {
    expect(nextDelayMs(-1)).toBe(1000)
    expect(nextDelayMs(Number.NaN)).toBe(1000)
    expect(nextDelayMs(Number.POSITIVE_INFINITY)).toBe(10_000)
    expect(nextDelayMs(1.9)).toBe(nextDelayMs(1))
  })

  test('returns whole milliseconds', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(Number.isInteger(nextDelayMs(attempt))).toBe(true)
    }
  })
})
