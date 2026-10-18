import { expect, test } from 'bun:test'
import { canDeleteRole } from './can-delete-role'

test('allows deleting a custom role with no users', () => {
  expect(canDeleteRole({ systemKey: null, userCount: 0 })).toBe(true)
})

test('blocks deleting a system role even with no users', () => {
  expect(canDeleteRole({ systemKey: 'owner', userCount: 0 })).toBe(false)
  expect(canDeleteRole({ systemKey: 'cashier', userCount: 0 })).toBe(false)
})

test('blocks deleting a custom role that still has users', () => {
  expect(canDeleteRole({ systemKey: null, userCount: 2 })).toBe(false)
})
