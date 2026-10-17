import { expect, test } from 'bun:test'
import { PERMISSIONS } from '@pos/api/permissions'
import { groupPermissions } from './permission-groups'

test('groups every offered permission once in catalogue order and ignores obsolete permissions', () => {
  const grouped = groupPermissions([...PERMISSIONS, 'obsolete.read', 'sales.void'])
  expect(grouped.flatMap((group) => group.permissions)).toEqual(PERMISSIONS.filter((permission) => !permission.startsWith('branches.')))
  expect(groupPermissions(['sales.void'])).toEqual([{ key: 'sales', permissions: ['sales.void'] }])
})

test('offers no branch permission in the editor', () => {
  expect(groupPermissions(['branches.manage', 'branches.switch'])).toEqual([])
})
