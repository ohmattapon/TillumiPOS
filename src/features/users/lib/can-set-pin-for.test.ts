import { describe, expect, test } from 'bun:test'
import { canSetPinFor } from './can-set-pin-for'

describe('canSetPinFor', () => {
  test('an owner other than me keeps their own PIN', () => {
    expect(canSetPinFor({ id: 1, role: 'owner' }, { id: 2 })).toBe(false)
  })
  test('nobody sets their own PIN here: that is the account menu, which asks for the password', () => {
    expect(canSetPinFor({ id: 1, role: 'owner' }, { id: 1 })).toBe(false)
    expect(canSetPinFor({ id: 3, role: 'cashier' }, { id: 3 })).toBe(false)
  })
  test('a cashier PIN can be set by anyone allowed to manage users', () => {
    expect(canSetPinFor({ id: 3, role: 'cashier' }, { id: 1 })).toBe(true)
  })
})
