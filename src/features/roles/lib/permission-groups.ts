import { PERMISSION_GROUPS } from '@pos/api/permissions'

export const groupPermissions = (all: readonly string[]) => PERMISSION_GROUPS
  .map((group) => ({ key: group.key, permissions: group.permissions.filter((permission) => all.includes(permission)) }))
  .filter((group) => group.permissions.length > 0)
