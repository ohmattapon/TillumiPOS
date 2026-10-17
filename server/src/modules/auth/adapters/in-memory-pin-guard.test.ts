import { describe, expect, test } from 'bun:test'
import { InMemoryPinGuard } from './in-memory-pin-guard'

const begin = (guard: InMemoryPinGuard, userId: number, times: number) =>
  Array.from({ length: times }, () => guard.begin(userId))

describe('InMemoryPinGuard', () => {
  test('every attempt counts when it begins: the fifth locks, the sixth is refused, fifteen minutes later it opens', () => {
    let clock = 1_000_000
    const guard = new InMemoryPinGuard(() => clock)

    expect(begin(guard, 7, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(guard.begin(7)).toBe('locked')

    clock += 15 * 60_000 - 1
    expect(guard.begin(7)).toBe('locked')
    clock += 1
    expect(guard.begin(7)).toBe('ok')
  })

  test('four attempts leave the user open', () => {
    const guard = new InMemoryPinGuard(() => 0)
    begin(guard, 7, 4)
    expect(guard.begin(7)).toBe('ok')
  })

  test('a right PIN clears the attempts counted so far, including its own', () => {
    const guard = new InMemoryPinGuard(() => 0)
    begin(guard, 7, 4)
    guard.recordSuccess(7)
    expect(begin(guard, 7, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
  })

  test('a right fifth PIN is not locked out by its own attempt', () => {
    const guard = new InMemoryPinGuard(() => 0)
    begin(guard, 7, 5)
    guard.recordSuccess(7)
    expect(guard.begin(7)).toBe('ok')
  })

  test('each user has their own count', () => {
    const guard = new InMemoryPinGuard(() => 0)
    begin(guard, 7, 5)
    begin(guard, 8, 4)

    expect(guard.begin(7)).toBe('locked')
    expect(guard.begin(8)).toBe('ok')
    expect(guard.begin(9)).toBe('ok')
  })

  test('reset forgets every count and lock', () => {
    const guard = new InMemoryPinGuard(() => 0)
    begin(guard, 7, 5)
    guard.reset()
    expect(guard.begin(7)).toBe('ok')
  })
})
