import { describe, expect, test } from 'bun:test'
import { InMemoryPinGuard } from './in-memory-pin-guard'

describe('InMemoryPinGuard', () => {
  test('four wrong PINs leave the user open, the fifth locks them for fifteen minutes', () => {
    let clock = 1_000_000
    const guard = new InMemoryPinGuard(() => clock)
    for (let i = 0; i < 4; i++) guard.recordFailure(7)
    expect(guard.check(7)).toBe('ok')

    guard.recordFailure(7)
    expect(guard.check(7)).toBe('locked')

    clock += 15 * 60_000 - 1
    expect(guard.check(7)).toBe('locked')
    clock += 1
    expect(guard.check(7)).toBe('ok')
  })

  test('a right PIN clears the failures counted so far', () => {
    const guard = new InMemoryPinGuard(() => 0)
    for (let i = 0; i < 4; i++) guard.recordFailure(7)
    guard.recordSuccess(7)
    for (let i = 0; i < 4; i++) guard.recordFailure(7)
    expect(guard.check(7)).toBe('ok')
  })

  test('each user has their own count', () => {
    const guard = new InMemoryPinGuard(() => 0)
    for (let i = 0; i < 5; i++) guard.recordFailure(7)
    for (let i = 0; i < 4; i++) guard.recordFailure(8)

    expect(guard.check(7)).toBe('locked')
    expect(guard.check(8)).toBe('ok')
    expect(guard.check(9)).toBe('ok')
  })

  test('reset forgets every count and lock', () => {
    const guard = new InMemoryPinGuard(() => 0)
    for (let i = 0; i < 5; i++) guard.recordFailure(7)
    guard.reset()
    expect(guard.check(7)).toBe('ok')
  })
})
