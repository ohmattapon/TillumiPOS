import { describe, expect, test } from 'bun:test'
import { canSetPinFor } from './can-set-pin-for'

describe('canSetPinFor', () => {
  test('an owner other than me keeps their own PIN', () => {
    expect(canSetPinFor({ id: 1, role: 'owner' }, { id: 2 })).toBe(false)
  })
  test('an owner may set their own PIN', () => {
    expect(canSetPinFor({ id: 1, role: 'owner' }, { id: 1 })).toBe(true)
  })
  test('a cashier PIN can be set by anyone allowed to manage users', () => {
    expect(canSetPinFor({ id: 3, role: 'cashier' }, { id: 1 })).toBe(true)
  })
})
