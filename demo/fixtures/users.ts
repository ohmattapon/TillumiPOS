import type { Permission } from '@pos/api/permissions'
import { PERMISSIONS } from '@pos/api/permissions'
import type { DemoMe } from './shop'
import type { roleSchemas } from '../../server/src/modules/roles/adapters/controllers/schemas/role.schema'
import type { UserResponse } from '../../server/src/modules/users/adapters/controllers/schemas/user.schema'

export type DemoRole = typeof roleSchemas.role.static

// Back-office people: the owner plus one cashier. Both have a fixed demo PIN
// for the quick staff switch; the PINs are documented in docs/demo-showcase.md.
export const demoUsers: UserResponse[] = [
  { id: 1, username: 'owner', displayName: 'เจ้าของร้าน', role: 'owner', roleId: 1, branchId: 1, isActive: true, hasPin: true },
  { id: 2, username: 'cashier', displayName: 'พนักงานขาย', role: 'cashier', roleId: 2, branchId: 1, isActive: true, hasPin: true },
]

/** Fixed demo PINs, keyed by user id. Owner 1111, cashier 1234. */
export const DEMO_PINS: Record<number, string> = { 1: '1111', 2: '1234' }

/** What the switched-to cashier may do: sell, members and stock, nothing administrative. */
export const CASHIER_PERMISSIONS: Permission[] = ['sales.void', 'members.write', 'qr.dismiss', 'inventory.receive', 'inventory.adjust']

export const demoRoles: DemoRole[] = [
  { id: 1, name: 'เจ้าของร้าน', permissions: [...PERMISSIONS], systemKey: 'owner', userCount: 1 },
  { id: 2, name: 'พนักงานขาย', permissions: [...CASHIER_PERMISSIONS], systemKey: 'cashier', userCount: 1 },
]

/** The /me shape for a user: the owner carries every permission, others their role's. */
export function meFor(user: UserResponse, roles: DemoRole[], allPermissions: readonly Permission[]): DemoMe {
  const role = roles.find((item) => item.id === user.roleId)
  const permissions = user.role === 'owner' ? [...allPermissions] : [...(role?.permissions ?? [])]
  return { ...user, roleName: role?.name ?? user.displayName, permissions }
}
