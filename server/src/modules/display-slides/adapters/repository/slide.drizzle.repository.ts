import { asc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { SlideEntity } from '../../../../domains/slide.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { displaySlides } from '../../../../infrastructure/database/schema/display-slides'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { ISlideRepository } from '../../applications/ports/slide.repository'

const columns = {
  id: displaySlides.id,
  imageKey: displaySlides.imageKey,
  sortOrder: displaySlides.sortOrder,
  isActive: displaySlides.isActive,
}

const order = [asc(displaySlides.sortOrder), asc(displaySlides.id)]

// Same code and message the API has always answered for a duplicate value.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleSlideRepository implements ISlideRepository {
  async findAll() {
    const rows = await currentExecutor().select(columns).from(displaySlides).orderBy(...order)
    return rows.map((row) => new SlideEntity(row))
  }

  async findActive() {
    const rows = await currentExecutor()
      .select(columns)
      .from(displaySlides)
      .where(eq(displaySlides.isActive, true))
      .orderBy(...order)
    return rows.map((row) => new SlideEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(displaySlides).where(eq(displaySlides.id, id))
    return row ? new SlideEntity(row) : null
  }

  async create(entity: SlideEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(displaySlides).values(values).returning(columns)
      return new SlideEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: SlideEntity) {
    const { id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(displaySlides)
        .set(values)
        .where(eq(displaySlides.id, id))
        .returning(columns)
      // Only reachable if the row vanished between the use case's read and this write.
      if (!row) throw new DomainNotFoundError('ไม่พบสไลด์')
      return new SlideEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }
}
