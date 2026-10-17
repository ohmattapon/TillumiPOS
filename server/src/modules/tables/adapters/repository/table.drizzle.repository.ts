import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DiningTableEntity } from '../../../../domains/dining-table.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { diningTables } from '../../../../infrastructure/database/schema/dining-tables'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { ITableRepository } from '../../applications/ports/table.repository'

const columns = {
  id: diningTables.id,
  branchId: diningTables.branchId,
  name: diningTables.name,
  zone: diningTables.zone,
  seats: diningTables.seats,
  x: diningTables.x,
  y: diningTables.y,
  width: diningTables.width,
  height: diningTables.height,
  sortOrder: diningTables.sortOrder,
  isActive: diningTables.isActive,
}

// Same code and message the API answers for a duplicate value elsewhere.
const duplicate = () => new DomainConflictError('ข้อมูลซ้ำกับที่มีอยู่แล้ว', 'DUPLICATE')

@injectable()
export class DrizzleTableRepository implements ITableRepository {
  async findAll(branchId: number) {
    const rows = await currentExecutor()
      .select(columns)
      .from(diningTables)
      .where(eq(diningTables.branchId, branchId))
      .orderBy(diningTables.sortOrder, diningTables.name)
    return rows.map((row) => new DiningTableEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(diningTables).where(eq(diningTables.id, id))
    return row ? new DiningTableEntity(row) : null
  }

  async create(entity: DiningTableEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(diningTables).values(values).returning(columns)
      return new DiningTableEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }

  async update(entity: DiningTableEntity) {
    const { id, branchId: _fixed, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor()
        .update(diningTables)
        .set(values)
        .where(eq(diningTables.id, id))
        .returning(columns)
      if (!row) throw new DomainNotFoundError('ไม่พบโต๊ะ', 'TABLE_NOT_FOUND')
      return new DiningTableEntity(row)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate()
      throw error
    }
  }
}
