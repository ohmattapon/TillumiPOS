import { DomainForbiddenError } from './errors/domain-forbidden.error'
import type { Permission } from './permission.vo'
import type { UserRole } from './user-role.vo'

/** Permissions are loaded from the actor's current role for each request. */
export interface Actor {
  role: UserRole
  permissions?: readonly Permission[]
}

/** Owners hold every permission, including permissions added in future. */
export const canDo = (actor: Actor, permission: Permission): boolean =>
  actor.role === 'owner' || (actor.permissions?.includes(permission) ?? false)

export function requirePermission(actor: Actor, permission: Permission, message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้'): void {
  if (!canDo(actor, permission)) throw new DomainForbiddenError(message, 'PERMISSION_DENIED', { permission })
}
