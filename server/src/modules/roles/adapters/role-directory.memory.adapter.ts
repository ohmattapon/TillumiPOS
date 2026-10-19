import { inject, injectable } from 'tsyringe'
import { PERMISSIONS } from '../../../domains/permission.vo'
import type { IRolePermissionReader } from '../../auth/applications/ports/role-permission-reader.port'
import type { IRoleDirectory, RoleRef } from '../../users/applications/ports/role-directory.port'
import { roleRepositoryToken, type IRoleRepository } from '../applications/ports/role.repository'

/**
 * Answers the users module's role questions (and the auth module's permission
 * reads) from the roles' own memory store, so it never touches the database.
 * The drizzle twin this replaces queries the roles table directly for the
 * system roles; here the (tiny) role list is paged instead.
 */
@injectable()
export class MemoryRoleDirectoryAdapter implements IRoleDirectory, IRolePermissionReader {
  constructor(@inject(roleRepositoryToken) private readonly repository: IRoleRepository) {}

  async findById(id: number): Promise<RoleRef | null> {
    const role = await this.repository.findById(id)
    return role ? { id: role.id, name: role.name, systemKey: role.systemKey } : null
  }

  async findByIdForUpdate(id: number): Promise<RoleRef | null> {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async findBySystemKey(key: 'owner' | 'cashier'): Promise<RoleRef> {
    const limit = 100
    for (let offset = 0; ; offset += limit) {
      const page = await this.repository.findAll({ limit, offset })
      const role = page.items.find((candidate) => candidate.systemKey === key)
      if (role) return { id: role.id, name: role.name, systemKey: key }
      if (page.items.length < limit) break
    }
    throw new Error('system role missing')
  }

  async permissionsOf(roleId: number) {
    const role = await this.repository.findById(roleId)
    return role?.isOwner ? PERMISSIONS : role?.permissions ?? []
  }
}
