import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { UserEntity } from './user.domain'

const valid = { id: 1, username: 'somchai', displayName: 'สมชาย', role: 'cashier' as const, isActive: true }
const owner = new UserEntity({ ...valid, role: 'owner' })

describe('UserEntity', () => {
  test('holds its properties', () => {
    expect(new UserEntity(valid).toSnapshot()).toEqual(valid)
  })

  test.each(['ab', 'x'.repeat(33), 'Somchai', 'som chai', 'สมชาย', ''])('rejects the username %p', (username) => {
    expect(() => new UserEntity({ ...valid, username })).toThrow(DomainError)
  })

  test.each(['abc', 'x'.repeat(32), 'som.chai_2-b'])('accepts the username %p', (username) => {
    expect(new UserEntity({ ...valid, username }).username).toBe(username)
  })

  test('normalizeUsername lower-cases, so logins match however the name was typed', () => {
    expect(UserEntity.normalizeUsername('SomChai')).toBe('somchai')
  })

  test.each(['', 'x'.repeat(101)])('rejects a display name of length %#: empty or over 100 characters', (displayName) => {
    expect(() => new UserEntity({ ...valid, displayName })).toThrow(DomainError)
  })

  test('rejects an unknown role', () => {
    expect(() => new UserEntity({ ...valid, role: 'admin' as never })).toThrow(DomainError)
  })

  test('with() changes only the given fields and never the id or username', () => {
    const changed = new UserEntity(valid).with({ displayName: 'สมชาย ใจดี', role: undefined })

    expect(changed.toSnapshot()).toEqual({ ...valid, displayName: 'สมชาย ใจดี' })
  })

  describe('wouldStopBeingActiveOwner', () => {
    test('is true when an active owner is deactivated or demoted', () => {
      expect(owner.wouldStopBeingActiveOwner({ isActive: false })).toBe(true)
      expect(owner.wouldStopBeingActiveOwner({ role: 'cashier' })).toBe(true)
    })

    test('is false for changes that keep an active owner an active owner', () => {
      expect(owner.wouldStopBeingActiveOwner({})).toBe(false)
      expect(owner.wouldStopBeingActiveOwner({ displayName: 'เจ้าของ' })).toBe(false)
      expect(owner.wouldStopBeingActiveOwner({ role: 'owner', isActive: true })).toBe(false)
    })

    test('is false for a cashier and for an owner who is already inactive', () => {
      expect(new UserEntity(valid).wouldStopBeingActiveOwner({ isActive: false })).toBe(false)
      expect(owner.with({ isActive: false }).wouldStopBeingActiveOwner({ role: 'cashier' })).toBe(false)
    })
  })
})
