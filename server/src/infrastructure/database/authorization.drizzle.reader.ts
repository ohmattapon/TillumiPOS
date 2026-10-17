import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { UserEntity } from '../../domains/user.domain'
import { isPermission } from '../../domains/permission.vo'
import { users } from './schema/users'
import { roles, rolePermissions } from './schema/roles'
import { currentExecutor } from '../../libs/transaction-context'
import type { ISessionAuthorizationReader } from '../../modules/auth/applications/ports/session-authorization-reader.port'

/** Auth read projection: one statement keeps the active user, role and grants in one snapshot. */
@injectable()
export class DrizzleSessionAuthorizationReader implements ISessionAuthorizationReader {
  async findActiveById(userId: number) {
    const rows = await currentExecutor().select({
      id: users.id, username: users.username, displayName: users.displayName,
      role: users.role, roleId: users.roleId, branchId: users.branchId, isActive: users.isActive,
      roleName: roles.name, permission: rolePermissions.permission,
    }).from(users).innerJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
    const row = rows[0]
    if (!row) return null
    const { roleName, permission: _, ...props } = row
    return { user: new UserEntity(props), roleName,
      permissions: rows.map((item) => item.permission).filter(isPermission) }
  }
}
