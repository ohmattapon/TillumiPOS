import { expect, test } from 'bun:test'
import { PERMISSIONS } from '@pos/api/permissions'
import { groupPermissions } from './permission-groups'

test('groups every known permission once in catalogue order and ignores obsolete permissions', () => {
  const grouped = groupPermissions([...PERMISSIONS, 'obsolete.read', 'sales.void'])
  expect(grouped.flatMap((group) => group.permissions)).toEqual([...PERMISSIONS])
  expect(groupPermissions(['sales.void'])).toEqual([{ key: 'sales', permissions: ['sales.void'] }])
})
