import { describe, expect, test } from 'bun:test'
import {
  DisplaySessionEntity,
  PAIRING_CODE_VALID_MS,
  isPairingCode,
  targetKey,
  type DisplayTarget,
} from './display-session.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

const now = new Date('2026-10-16T09:00:00Z')
const after = (ms: number) => new Date(now.getTime() + ms)
const waiting = () => new DisplaySessionEntity({ id: 's1', token: 'T'.repeat(43), code: '482913', createdAt: now, target: null })
const till: DisplayTarget = { branchId: 1, registerId: 4 }

describe('a pairing code', () => {
  test('is exactly six digits', () => {
    expect(isPairingCode('482913')).toBe(true)
    expect(isPairingCode('48291')).toBe(false)
    expect(isPairingCode('4829133')).toBe(false)
    expect(isPairingCode('48291a')).toBe(false)
    expect(isPairingCode(' 482913')).toBe(false)
  })
})

describe('the target of a screen', () => {
  test('is a register of a branch, or the branch itself when there is no register', () => {
    expect(targetKey({ branchId: 1, registerId: 4 })).not.toBe(targetKey({ branchId: 1, registerId: 5 }))
    expect(targetKey({ branchId: 1, registerId: null })).not.toBe(targetKey({ branchId: 2, registerId: null }))
    expect(targetKey({ branchId: 1, registerId: null })).not.toBe(targetKey({ branchId: 1, registerId: 0 }))
    expect(targetKey({ branchId: 1, registerId: 4 })).toBe(targetKey({ branchId: 1, registerId: 4 }))
  })
})

describe('DisplaySessionEntity', () => {
  test('starts waiting for a till, and the code is good for ten minutes', () => {
    const session = waiting()
    expect(session.status).toBe('waiting')
    expect(session.expiresAt).toEqual(after(PAIRING_CODE_VALID_MS))
    expect(session.isExpired(after(PAIRING_CODE_VALID_MS - 1))).toBe(false)
    expect(session.isExpired(after(PAIRING_CODE_VALID_MS))).toBe(true)
  })

  test('pairing binds it to the target of the till', () => {
    const paired = waiting().pair(till, after(60_000))
    expect(paired.status).toBe('paired')
    expect(paired.target).toEqual(till)
    expect(paired.id).toBe('s1')
  })

  test('a paired screen does not expire with its code', () => {
    const paired = waiting().pair(till, after(60_000))
    expect(paired.isExpired(after(PAIRING_CODE_VALID_MS * 100))).toBe(false)
  })

  test('refuses a code that ran out, and a screen that is already paired', () => {
    expect(codeOf(() => waiting().pair(till, after(PAIRING_CODE_VALID_MS)))).toBe('DISPLAY_CODE_NOT_FOUND')
    const paired = waiting().pair(till, after(60_000))
    expect(codeOf(() => paired.pair({ branchId: 1, registerId: 9 }, after(120_000)))).toBe('DISPLAY_ALREADY_PAIRED')
  })

  test('has a snapshot with its code and no target while it waits', () => {
    const snapshot = waiting().toSnapshot()
    expect(snapshot).toMatchObject({ id: 's1', code: '482913', target: null })
  })
})
