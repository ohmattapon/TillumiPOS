import { PERMISSION_GROUPS } from '@pos/api/permissions'

/** Not offered in the editor: the shop has one branch, so there is nothing to switch or manage. The API still knows them. */
const RETIRED = new Set(['branches.manage', 'branches.switch'])

/** The groups the role editor shows, each with the permissions it still offers. */
export const groupPermissions = (all: readonly string[]) => PERMISSION_GROUPS
  .map((group) => ({ key: group.key, permissions: group.permissions.filter((permission) => all.includes(permission) && !RETIRED.has(permission)) }))
  .filter((group) => group.permissions.length > 0)
