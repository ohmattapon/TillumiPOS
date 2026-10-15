import { and, count, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { promotions } from '../../../../infrastructure/database/schema/promotions'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IPromotionRepository, PromotionListQuery } from '../../applications/ports/promotion.repository'
import { snapshotOf } from '../promotion.snapshot'

const nameTaken = () => new DomainConflictError('ชื่อโปรโมชันนี้ถูกใช้แล้ว', 'PROMOTION_NAME_TAKEN')

@injectable()
export class DrizzlePromotionRepository implements IPromotionRepository {
  async find(query: PromotionListQuery) {
    const where = query.isActive === undefined ? undefined : and(eq(promotions.isActive, query.isActive))
    const rows = await currentExecutor()
      .select()
      .from(promotions)
      .where(where)
      .orderBy(promotions.name, promotions.id)
      .limit(query.limit)
      .offset(query.offset)
    const [counted] = await currentExecutor().select({ value: count() }).from(promotions).where(where)
    return { items: rows.map((row) => new PromotionEntity(row)), total: counted!.value }
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(promotions).where(eq(promotions.id, id))
    return row ? new PromotionEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(promotions).where(eq(promotions.id, id)).for('update')
    return row ? new PromotionEntity(row) : null
  }

  async create(entity: PromotionEntity) {
    const { id: _id, ...values } = snapshotOf(entity)
    try {
      const [row] = await currentExecutor().insert(promotions).values(values).returning()
      return new PromotionEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }

  async update(entity: PromotionEntity) {
    const { id, createdAt: _createdAt, ...values } = snapshotOf(entity)
    try {
      const [row] = await currentExecutor().update(promotions).set(values).where(eq(promotions.id, id)).returning()
      if (!row) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
      return new PromotionEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }
}
