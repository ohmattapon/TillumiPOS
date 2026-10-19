import { injectable } from 'tsyringe'
import { CategoryEntity, type CategoryEntityProps } from '../../../../domains/category.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { ICategoryRepository } from '../../applications/ports/category.repository'

// Same code and message the API has always answered for a duplicate value.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

const byOrder = (a: CategoryEntityProps, b: CategoryEntityProps) =>
  a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** No-database category store: one Map, ids assigned from 1 in creation order. */
@injectable()
export class MemoryCategoryRepository implements ICategoryRepository {
  private readonly rows = new Map<number, CategoryEntityProps>()
  private nextId = 1

  async findAll() {
    return [...this.rows.values()].sort(byOrder).map((row) => new CategoryEntity(row))
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new CategoryEntity(row) : null
  }

  async create(entity: CategoryEntity) {
    if ([...this.rows.values()].some((row) => row.name === entity.name)) throw duplicate()
    const stored: CategoryEntityProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new CategoryEntity(stored)
  }

  async update(entity: CategoryEntity) {
    const stored = this.rows.get(entity.id)
    // Only reachable if the row vanished between the use case's read and this write.
    if (!stored) throw new DomainNotFoundError('ไม่พบหมวดหมู่')
    if ([...this.rows.values()].some((row) => row.id !== entity.id && row.name === entity.name)) throw duplicate()
    const next: CategoryEntityProps = { ...entity.toSnapshot(), id: stored.id }
    this.rows.set(next.id, next)
    return new CategoryEntity(next)
  }
}
