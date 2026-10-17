import { describe, expect, test } from 'bun:test'
import { InMemorySetupCode } from './in-memory-setup-code'

describe('InMemorySetupCode', () => {
  test('nothing is accepted before a code is issued', () => {
    expect(new InMemorySetupCode().verify('ABC')).toBe('not-issued')
  })

  test('issues a 12 character code from a set without look-alike characters, and accepts exactly it', () => {
    const store = new InMemorySetupCode()
    const code = store.issue()

    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/)
    expect(store.verify(code)).toBe('accepted')
    expect(store.verify(code.toLowerCase())).toBe('accepted')
    expect(store.verify(` ${code} `)).toBe('accepted')
    expect(store.verify('WRONGWRONGWR')).toBe('wrong')
  })

  test('a new code replaces the old one and clears the failures', () => {
    const store = new InMemorySetupCode()
    const first = store.issue()
    for (let attempt = 0; attempt < 4; attempt++) store.verify('nope')

    const second = store.issue()

    expect(second).not.toBe(first)
    expect(store.verify(first)).toBe('wrong')
    expect(store.verify(second)).toBe('accepted')
  })

  test('five wrong tries lock it, even for the right code, until the lock runs out', () => {
    let now = 1_000_000
    const store = new InMemorySetupCode(() => now)
    const code = store.issue()

    for (let attempt = 0; attempt < 5; attempt++) expect(store.verify('nope')).toBe('wrong')

    expect(store.verify(code)).toBe('locked')
    now += 14 * 60_000
    expect(store.verify(code)).toBe('locked')
    now += 2 * 60_000
    expect(store.verify(code)).toBe('accepted')
  })

  test('a retired code is gone', () => {
    const store = new InMemorySetupCode()
    const code = store.issue()

    store.retire()

    expect(store.verify(code)).toBe('not-issued')
  })
})
