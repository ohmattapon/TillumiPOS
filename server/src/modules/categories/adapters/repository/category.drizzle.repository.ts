import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { CategoryEntity } from '../../../../domains/category.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categories } from '../../../../infrastructure/database/schema/categories'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { ICategoryRepository } from '../../applications/ports/category.repository'

const columns = {
  id: categories.id,
  name: categories.name,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
}

// Same code and message the API has always answered for a duplicate value.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleCategoryRepository implements ICategoryRepository {
  async findAll() {
    const rows = await currentExecutor()
      .select(columns)
      .from(categories)
      .orderBy(categories.sortOrder, categories.name)
    return rows.map((row) => new CategoryEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(categories).where(eq(categories.id, id))
    return row ? new CategoryEntity(row) : null
  }

  async create(entity: CategoryEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(categories).values(values).returning(columns)
      return new CategoryEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: CategoryEntity) {
    const { id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().update(categories).set(values).where(eq(categories.id, id)).returning(columns)
      // Only reachable if the row vanished between the use case's read and this write.
      if (!row) throw new DomainNotFoundError('ไม่พบหมวดหมู่')
      return new CategoryEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }
}
