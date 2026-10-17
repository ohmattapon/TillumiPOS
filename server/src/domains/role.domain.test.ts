import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { DomainConflictError } from './errors/domain-conflict.error'
import { RoleEntity, type RoleEntityProps } from './role.domain'

const make = (over: Partial<RoleEntityProps> = {}) =>
  new RoleEntity({ id: 3, name: 'ผู้จัดการ', systemKey: null, permissions: ['sales.void'], ...over })

describe('RoleEntity', () => {
  test('trims names and keeps a sorted unique permission set', () => {
    expect(make({ name: '  ผู้จัดการ  ', permissions: ['sales.void', 'inventory.adjust', 'sales.void'] }).toSnapshot())
      .toEqual({ id: 3, name: 'ผู้จัดการ', systemKey: null, permissions: ['inventory.adjust', 'sales.void'] })
  })
  test.each(['', '   ', 'x'.repeat(61)])('rejects invalid name %p', (name) => {
    expect(() => make({ name })).toThrow(DomainError)
  })
  test('rejects unknown permissions', () => {
    expect(() => make({ permissions: ['sales.fly' as never] })).toThrow(DomainError)
  })
  test('protects owner name and permission changes with a conflict', () => {
    const owner = make({ systemKey: 'owner', name: 'เจ้าของร้าน', permissions: [] })
    expect(owner.isSystem).toBe(true)
    expect(owner.isOwner).toBe(true)
    for (const change of [{ name: 'อื่น' }, { permissions: ['sales.void'] as const }]) {
      expect(() => owner.with(change)).toThrow(DomainConflictError)
      expect(() => owner.with(change)).toThrow(expect.objectContaining({ code: 'ROLE_PROTECTED' }))
    }
  })
  test('cashier permissions can change while its name stays protected', () => {
    const cashier = make({ systemKey: 'cashier', name: 'แคชเชียร์', permissions: [] })
    expect(cashier.with({ permissions: ['reports.read'] }).permissions).toEqual(['reports.read'])
    expect(() => cashier.with({ name: 'อื่น' })).toThrow(expect.objectContaining({ code: 'ROLE_PROTECTED' }))
  })
  test('custom roles can change names and permissions without changing the original', () => {
    const role = make()
    expect(role.isSystem).toBe(false)
    expect(role.isOwner).toBe(false)
    expect(role.with({ name: 'หัวหน้ากะ', permissions: ['shifts.override'] })).toMatchObject({ name: 'หัวหน้ากะ', permissions: ['shifts.override'] })
    expect(role.name).toBe('ผู้จัดการ')
  })
})
