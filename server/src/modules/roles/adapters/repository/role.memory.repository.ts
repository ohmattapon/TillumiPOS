import { injectable } from 'tsyringe'
import { RoleEntity, type RoleEntityProps } from '../../../../domains/role.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IRoleRepository, RoleListQuery } from '../../applications/ports/role.repository'

const nameTaken = () => new DomainConflictError('ชื่อบทบาทซ้ำ', 'ROLE_NAME_TAKEN')

/**
 * No-database role store: one Map, ids assigned from 1 in creation order.
 * Use cases guard deletion through the role-usage port, so — like the drizzle
 * twin's foreign-key safety net — nothing extra is checked here.
 */
@injectable()
export class MemoryRoleRepository implements IRoleRepository {
  private readonly rows = new Map<number, RoleEntityProps>()
  private nextId = 1

  async findAll(query: RoleListQuery) {
    const ordered = [...this.rows.values()].sort((a, b) => a.id - b.id)
    return {
      items: ordered.slice(query.offset, query.offset + query.limit).map((row) => new RoleEntity(row)),
      total: ordered.length,
    }
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new RoleEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async create(entity: RoleEntity) {
    if ([...this.rows.values()].some((row) => row.name === entity.name)) throw nameTaken()
    const stored: RoleEntityProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new RoleEntity(stored)
  }

  async update(entity: RoleEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบบทบาท', 'ROLE_NOT_FOUND')
    if ([...this.rows.values()].some((row) => row.id !== entity.id && row.name === entity.name)) throw nameTaken()
    const next: RoleEntityProps = { ...entity.toSnapshot(), id: stored.id }
    this.rows.set(next.id, next)
    return new RoleEntity(next)
  }

  async delete(id: number) {
    this.rows.delete(id)
  }
}
