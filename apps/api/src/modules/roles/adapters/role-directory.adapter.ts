import { eq } from 'drizzle-orm'
import { inject, injectable } from 'tsyringe'
import { PERMISSIONS } from '../../../domains/permission.vo'
import { roles } from '../../../infrastructure/database/schema/roles'
import { currentExecutor } from '../../../libs/transaction-context'
import type { IRoleDirectory, RoleRef } from '../../users/applications/ports/role-directory.port'
import type { IRolePermissionReader } from '../../auth/applications/ports/role-permission-reader.port'
import { roleRepositoryToken, type IRoleRepository } from '../applications/ports/role.repository'

@injectable()
export class RoleDirectoryAdapter implements IRoleDirectory, IRolePermissionReader {
  constructor(@inject(roleRepositoryToken) private readonly repository: IRoleRepository) {}
  async findById(id: number): Promise<RoleRef | null> {
    const role = await this.repository.findById(id)
    return role ? { id: role.id, name: role.name, systemKey: role.systemKey } : null
  }
  async findByIdForUpdate(id: number): Promise<RoleRef | null> {
    const role = await this.repository.findByIdForUpdate(id)
    return role ? { id: role.id, name: role.name, systemKey: role.systemKey } : null
  }
  async findBySystemKey(key: 'owner' | 'cashier'): Promise<RoleRef> {
    const [row] = await currentExecutor().select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.systemKey, key))
    if (!row) throw new Error('system role missing')
    return { ...row, systemKey: key }
  }
  async permissionsOf(roleId: number) {
    const role = await this.repository.findById(roleId)
    return role?.isOwner ? PERMISSIONS : role?.permissions ?? []
  }
}
