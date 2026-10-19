import { inject, injectable } from 'tsyringe'
import { isPermission } from '../../../domains/permission.vo'
import { roleRepositoryToken, type IRoleRepository } from '../../roles/applications/ports/role.repository'
import { userRepositoryToken, type IUserRepository } from '../../users/applications/ports/user.repository'
import type { ISessionAuthorizationReader } from '../applications/ports/session-authorization-reader.port'

/**
 * No-database session reader: builds the per-request authorization snapshot
 * from the users' and roles' own memory stores through their ports, so it
 * never touches the database. Mirrors the drizzle twin (which joins the same
 * two tables in one statement): inactive or missing users answer null, a user
 * whose role is gone answers null like the inner join, and permissions are
 * the role's grants filtered to known values. hasPin comes from the user
 * store, which derives it from the stored PIN hash on read.
 *
 * Demo-only wiring lives in the demo-memory composition root. This reads two
 * modules' repository ports instead of declaring narrower consumer ports
 * because the drizzle twin it replaces also reads both tables directly; a
 * fuller split would add ports and adapters for a path only demo mode uses.
 */
@injectable()
export class MemorySessionAuthorizationReader implements ISessionAuthorizationReader {
  constructor(
    @inject(userRepositoryToken) private readonly users: IUserRepository,
    @inject(roleRepositoryToken) private readonly roles: IRoleRepository,
  ) {}

  async findActiveById(userId: number) {
    const user = await this.users.findActiveById(userId)
    if (!user || user.roleId === null) return null
    const role = await this.roles.findById(user.roleId)
    if (!role) return null
    return { user, roleName: role.name, permissions: role.permissions.filter(isPermission) }
  }
}
