import { injectable } from 'tsyringe'
import { DiningTableEntity, type DiningTableProps } from '../../../../domains/dining-table.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { ITableRepository } from '../../applications/ports/table.repository'

// Same code and message the API answers for a duplicate value elsewhere.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

/** No-database table store: one Map, ids assigned from 1 in creation order. */
@injectable()
export class MemoryTableRepository implements ITableRepository {
  private readonly rows = new Map<number, DiningTableProps>()
  private nextId = 1

  async findAll(branchId: number) {
    return [...this.rows.values()]
      .filter((row) => row.branchId === branchId)
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((row) => new DiningTableEntity(row))
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new DiningTableEntity(row) : null
  }

  async create(entity: DiningTableEntity) {
    if (
      [...this.rows.values()].some((row) => row.branchId === entity.branchId && row.name === entity.name)
    )
      throw duplicate()
    const stored: DiningTableProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new DiningTableEntity(stored)
  }

  async update(entity: DiningTableEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบโต๊ะ', 'TABLE_NOT_FOUND')
    if (
      [...this.rows.values()].some(
        (row) => row.id !== entity.id && row.branchId === stored.branchId && row.name === entity.name,
      )
    )
      throw duplicate()
    // The branch never changes, like the drizzle twin's SET clause.
    const next: DiningTableProps = { ...entity.toSnapshot(), id: stored.id, branchId: stored.branchId }
    this.rows.set(next.id, next)
    return new DiningTableEntity(next)
  }
}
