import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PromotionEntity, type PromotionProps } from '../../../../domains/promotion.domain'
import type { IPromotionRepository, PromotionListQuery } from '../../applications/ports/promotion.repository'

const nameTaken = () => new DomainConflictError('ชื่อโปรโมชันนี้ถูกใช้แล้ว', 'PROMOTION_NAME_TAKEN')

// The database unique index compares lower(name): names that differ only by
// case clash in both twins.
const nameClash = (rows: PromotionProps[], selfId: number | null, name: string) =>
  rows.some((row) => row.id !== selfId && row.name.toLowerCase() === name.toLowerCase())

/** No-database promotion store: one Map, ids assigned from 1 in creation order. */
@injectable()
export class MemoryPromotionRepository implements IPromotionRepository {
  private readonly rows = new Map<number, PromotionProps>()
  private nextId = 1

  async find(query: PromotionListQuery) {
    const matching = [...this.rows.values()]
      .filter((row) => query.isActive === undefined || row.isActive === query.isActive)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id))
    return {
      items: matching.slice(query.offset, query.offset + query.limit).map((row) => new PromotionEntity(row)),
      total: matching.length,
    }
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new PromotionEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async create(entity: PromotionEntity) {
    if (nameClash([...this.rows.values()], null, entity.name)) throw nameTaken()
    const stored: PromotionProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new PromotionEntity(stored)
  }

  async update(entity: PromotionEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
    if (nameClash([...this.rows.values()], entity.id, entity.name)) throw nameTaken()
    // The image key is never patched: only setImageKey writes it, so a normal
    // edit cannot clobber it. createdAt never changes either.
    const next: PromotionProps = {
      ...entity.toSnapshot(),
      id: stored.id,
      imageKey: stored.imageKey,
      createdAt: stored.createdAt,
    }
    this.rows.set(next.id, next)
    return new PromotionEntity(next)
  }

  async setImageKey(id: number, imageKey: string | null) {
    const stored = this.rows.get(id)
    if (!stored) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
    const next: PromotionProps = { ...stored, imageKey }
    this.rows.set(id, next)
    return new PromotionEntity(next)
  }
}
