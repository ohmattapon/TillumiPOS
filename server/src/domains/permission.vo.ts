export const PERMISSION_GROUPS = [
  { key: 'sales', permissions: ['sales.void', 'qr.dismiss', 'reports.read'] },
  { key: 'catalog', permissions: ['products.write', 'categories.write', 'modifiers.write', 'promotions.write', 'members.write', 'tables.write'] },
  { key: 'inventory', permissions: ['inventory.receive', 'inventory.adjust'] },
  { key: 'operations', permissions: ['registers.manage', 'branches.manage', 'branches.switch', 'shifts.override', 'settings.write'] },
  { key: 'admin', permissions: ['users.manage', 'roles.manage', 'audit.read'] },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['permissions'][number]
export const PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) => group.permissions)
export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && PERMISSIONS.includes(value as Permission)
