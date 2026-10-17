import { count, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { RoleEntity, type RoleEntityProps } from '../../../../domains/role.domain'
import { isPermission } from '../../../../domains/permission.vo'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { roles, rolePermissions } from '../../../../infrastructure/database/schema/roles'
import { currentExecutor } from '../../../../libs/transaction-context'
import { isForeignKeyViolation, isUniqueViolation } from '../../../../libs/pg-error'
import type { IRoleRepository, RoleListQuery } from '../../applications/ports/role.repository'

type RoleRow = typeof roles.$inferSelect
export const roleEntity = (row: RoleRow, permissions: readonly string[]) => new RoleEntity({
  id: row.id, name: row.name, systemKey: row.systemKey as RoleEntityProps['systemKey'], permissions: permissions.filter(isPermission),
})

@injectable()
export class DrizzleRoleRepository implements IRoleRepository {
  async findAll(query: RoleListQuery) {
    const db = currentExecutor()
    const rows = await db.select().from(roles).orderBy(roles.id).limit(query.limit).offset(query.offset)
    const permissions = rows.length ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, rows.map((row) => row.id))) : []
    const [total] = await db.select({ value: count() }).from(roles)
    return { items: rows.map((row) => roleEntity(row, permissions.filter((p) => p.roleId === row.id).map((p) => p.permission))), total: total!.value }
  }
  async findById(id: number) {
    const [row] = await currentExecutor().select().from(roles).where(eq(roles.id, id))
    if (!row) return null
    const permissions = await currentExecutor().select().from(rolePermissions).where(eq(rolePermissions.roleId, id))
    return roleEntity(row, permissions.map((p) => p.permission))
  }
  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(roles).where(eq(roles.id, id)).for('update')
    if (!row) return null
    const permissions = await currentExecutor().select().from(rolePermissions).where(eq(rolePermissions.roleId, id))
    return roleEntity(row, permissions.map((p) => p.permission))
  }
  async create(entity: RoleEntity) {
    try {
      const [row] = await currentExecutor().insert(roles).values({ name: entity.name, systemKey: entity.systemKey }).returning()
      if (entity.permissions.length) await currentExecutor().insert(rolePermissions).values(entity.permissions.map((permission) => ({ roleId: row!.id, permission })))
      return roleEntity(row!, entity.permissions)
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainConflictError('ชื่อบทบาทซ้ำ', 'ROLE_NAME_TAKEN')
      throw error
    }
  }
  async update(entity: RoleEntity) {
    try {
      const [row] = await currentExecutor().update(roles).set({ name: entity.name, updatedAt: new Date() }).where(eq(roles.id, entity.id)).returning()
      if (!row) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
      await currentExecutor().delete(rolePermissions).where(eq(rolePermissions.roleId, entity.id))
      if (entity.permissions.length) await currentExecutor().insert(rolePermissions).values(entity.permissions.map((permission) => ({ roleId: entity.id, permission })))
      return roleEntity(row, entity.permissions)
    } catch (error) {
      if (isUniqueViolation(error)) throw new DomainConflictError('ชื่อบทบาทซ้ำ', 'ROLE_NAME_TAKEN')
      throw error
    }
  }
  async delete(id: number) {
    try { await currentExecutor().delete(roles).where(eq(roles.id, id)) }
    catch (error) {
      if (isForeignKeyViolation(error)) throw new DomainConflictError('มีผู้ใช้ถือบทบาทนี้อยู่', 'ROLE_IN_USE')
      throw error
    }
  }
}
