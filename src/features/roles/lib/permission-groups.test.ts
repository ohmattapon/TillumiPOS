import { expect, test } from 'bun:test'
import { PERMISSIONS } from '@pos/api/permissions'
import { countGranted, groupPermissions } from './permission-groups'

test('groups every offered permission once in catalogue order and ignores obsolete permissions', () => {
  const grouped = groupPermissions([...PERMISSIONS, 'obsolete.read', 'sales.void'])
  expect(grouped.flatMap((group) => group.permissions)).toEqual(PERMISSIONS.filter((permission) => !permission.startsWith('branches.')))
  expect(groupPermissions(['sales.void'])).toEqual([{ key: 'sales', permissions: ['sales.void'] }])
})

test('offers no branch permission in the editor', () => {
  expect(groupPermissions(['branches.manage', 'branches.switch'])).toEqual([])
})

test('counts granted permissions against what the editor offers', () => {
  const offered = groupPermissions(PERMISSIONS).flatMap((group) => group.permissions).length
  expect(countGranted(['sales.void', 'reports.read'])).toEqual({ granted: 2, total: offered })
  expect(countGranted([])).toEqual({ granted: 0, total: offered })
})

test('leaves retired and unknown permissions out of the count', () => {
  expect(countGranted(['branches.manage', 'obsolete.read', 'sales.void']).granted).toBe(1)
})
