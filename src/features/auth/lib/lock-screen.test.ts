import { describe, expect, test } from 'bun:test'
import { lockScreenMayClose } from './lock-screen'

describe('lockScreenMayClose', () => {
  test('the person at the till can close it when no switch is in flight', () => {
    expect(lockScreenMayClose('user', false)).toBe(true)
  })

  test('the person at the till cannot close it while a switch is in flight', () => {
    expect(lockScreenMayClose('user', true)).toBe(false)
  })

  // The hand-over runs inside the switch's onSuccess, where the mutation still reports pending.
  test('a successful switch closes it even though the mutation still reports pending', () => {
    expect(lockScreenMayClose('hand-over', true)).toBe(true)
  })
})
