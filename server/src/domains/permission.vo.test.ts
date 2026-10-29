import { describe, expect, test } from 'bun:test'
import { isPermission, PERMISSIONS, PERMISSION_GROUPS } from './permission.vo'

describe('permissions', () => {
  test('are unique and each belongs to exactly one group', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
    expect(PERMISSION_GROUPS.flatMap((group) => group.permissions).sort()).toEqual([...PERMISSIONS].sort())
  })
  test('uses area.action names and rejects unknown values', () => {
    for (const permission of PERMISSIONS) {
      // `points_adjust` is one action word, so the underscore is allowed inside the action only.
      expect(permission).toMatch(/^[a-z]+\.[a-z]+(_[a-z]+)*$/)
      expect(isPermission(permission)).toBe(true)
    }
    for (const value of ['sales.fly', 7, null, {}, undefined]) expect(isPermission(value)).toBe(false)
  })
})
