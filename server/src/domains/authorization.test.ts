import { describe, expect, test } from 'bun:test'
import { canDo, requirePermission } from './authorization'
import { DomainForbiddenError } from './errors/domain-forbidden.error'
import { PERMISSIONS } from './permission.vo'

describe('authorization', () => {
  test('owners hold every permission without a stored list', () => {
    for (const permission of PERMISSIONS) {
      expect(canDo({ role: 'owner' }, permission)).toBe(true)
      expect(canDo({ role: 'owner', permissions: [] }, permission)).toBe(true)
    }
  })
  test('cashiers hold only explicitly granted permissions', () => {
    expect(canDo({ role: 'cashier' }, 'sales.void')).toBe(false)
    expect(canDo({ role: 'cashier', permissions: ['sales.void'] }, 'sales.void')).toBe(true)
    expect(canDo({ role: 'cashier', permissions: ['sales.void'] }, 'inventory.adjust')).toBe(false)
  })
  test('requires permission with a stable error and optional caller message', () => {
    expect(() => requirePermission({ role: 'owner' }, 'sales.void')).not.toThrow()
    expect(() => requirePermission({ role: 'cashier' }, 'sales.void')).toThrow('ไม่มีสิทธิ์ใช้งานส่วนนี้')
    try {
      requirePermission({ role: 'cashier' }, 'sales.void', 'เฉพาะเจ้าของร้านเท่านั้น')
      throw new Error('expected permission rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainForbiddenError)
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED', message: 'เฉพาะเจ้าของร้านเท่านั้น', params: { permission: 'sales.void' } })
    }
  })
})
