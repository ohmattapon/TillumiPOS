import { describe, expect, test } from 'bun:test'
import { InMemoryLoginGuard } from './in-memory-login-guard'

const begin = (guard: InMemoryLoginGuard, username: string, times: number) =>
  Array.from({ length: times }, () => guard.begin(username))

describe('InMemoryLoginGuard', () => {
  test('every attempt counts when it begins: the fifth locks, the sixth is refused, fifteen minutes later it opens', () => {
    let clock = 1_000_000
    const guard = new InMemoryLoginGuard(() => clock)

    expect(begin(guard, 'somchai', 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(guard.begin('somchai')).toBe('locked')

    clock += 15 * 60_000 - 1
    expect(guard.begin('somchai')).toBe('locked')
    clock += 1
    expect(guard.begin('somchai')).toBe('ok')
  })

  test('a right password clears the attempts counted so far, including its own', () => {
    const guard = new InMemoryLoginGuard(() => 0)
    begin(guard, 'somchai', 5)
    guard.recordSuccess('somchai')
    expect(begin(guard, 'somchai', 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
  })

  test('each name has its own count', () => {
    const guard = new InMemoryLoginGuard(() => 0)
    begin(guard, 'somchai', 5)

    expect(guard.begin('somchai')).toBe('locked')
    expect(guard.begin('somying')).toBe('ok')
  })

  test('reset forgets every count and lock', () => {
    const guard = new InMemoryLoginGuard(() => 0)
    begin(guard, 'somchai', 5)
    guard.reset()
    expect(guard.begin('somchai')).toBe('ok')
  })
})
