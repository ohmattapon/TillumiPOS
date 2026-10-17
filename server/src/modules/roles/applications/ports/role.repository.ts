import type { RoleEntity } from '../../../../domains/role.domain'
import type { Page } from '../../../../domains/page'
export interface RoleListQuery { limit: number; offset: number }
export interface RoleReadModel { id: number; name: string; systemKey: 'owner' | 'cashier' | null; permissions: readonly string[]; userCount: number }
export interface IRoleRepository {
  findAll(query: RoleListQuery): Promise<Page<RoleEntity>>
  findById(id: number): Promise<RoleEntity | null>
  findByIdForUpdate(id: number): Promise<RoleEntity | null>
  create(entity: RoleEntity): Promise<RoleEntity>
  update(entity: RoleEntity): Promise<RoleEntity>
  delete(id: number): Promise<void>
}
export const roleRepositoryToken = Symbol('IRoleRepository').toString()
