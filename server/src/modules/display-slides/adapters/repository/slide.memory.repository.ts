import { injectable } from 'tsyringe'
import { SlideEntity, type SlideEntityProps } from '../../../../domains/slide.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { ISlideRepository } from '../../applications/ports/slide.repository'

// Same code and message the API has always answered for a duplicate value.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

const byOrder = (a: SlideEntityProps, b: SlideEntityProps) => a.sortOrder - b.sortOrder || a.id - b.id

/** No-database slide store: one Map, ids assigned from 1 in creation order. */
@injectable()
export class MemorySlideRepository implements ISlideRepository {
  private readonly rows = new Map<number, SlideEntityProps>()
  private nextId = 1

  async findAll() {
    return [...this.rows.values()].sort(byOrder).map((row) => new SlideEntity(row))
  }

  async findActive() {
    return [...this.rows.values()]
      .filter((row) => row.isActive)
      .sort(byOrder)
      .map((row) => new SlideEntity(row))
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new SlideEntity(row) : null
  }

  async create(entity: SlideEntity) {
    if ([...this.rows.values()].some((row) => row.imageKey === entity.imageKey)) throw duplicate()
    const stored: SlideEntityProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new SlideEntity(stored)
  }

  async update(entity: SlideEntity) {
    const stored = this.rows.get(entity.id)
    // Only reachable if the row vanished between the use case's read and this write.
    if (!stored) throw new DomainNotFoundError('ไม่พบสไลด์')
    if ([...this.rows.values()].some((row) => row.id !== entity.id && row.imageKey === entity.imageKey))
      throw duplicate()
    const next: SlideEntityProps = { ...entity.toSnapshot(), id: stored.id }
    this.rows.set(next.id, next)
    return new SlideEntity(next)
  }

  async delete(id: number) {
    const stored = this.rows.get(id)
    if (!stored) throw new DomainNotFoundError('ไม่พบสไลด์')
    this.rows.delete(id)
    return new SlideEntity(stored)
  }
}
