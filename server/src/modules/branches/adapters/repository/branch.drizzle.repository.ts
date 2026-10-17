import { count, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { BranchEntity } from '../../../../domains/branch.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { branches } from '../../../../infrastructure/database/schema/branches'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IBranchRepository } from '../../applications/ports/branch.repository'

const columns = {
  id: branches.id,
  code: branches.code,
  name: branches.name,
  address: branches.address,
  phone: branches.phone,
  isActive: branches.isActive,
}

const codeTaken = () => new DomainConflictError('รหัสสาขานี้มีอยู่แล้ว', 'BRANCH_CODE_TAKEN')

@injectable()
export class DrizzleBranchRepository implements IBranchRepository {
  async findAll() {
    const rows = await currentExecutor().select(columns).from(branches).orderBy(branches.code)
    return rows.map((row) => new BranchEntity(row))
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select(columns).from(branches).where(eq(branches.id, id))
    return row ? new BranchEntity(row) : null
  }

  async findMain() {
    const [row] = await currentExecutor().select(columns).from(branches).where(eq(branches.code, 'MAIN'))
    return row ? new BranchEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select(columns).from(branches).where(eq(branches.id, id)).for('update')
    return row ? new BranchEntity(row) : null
  }

  async create(entity: BranchEntity) {
    const { id: _unassigned, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(branches).values(values).returning(columns)
      return new BranchEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw codeTaken()
      throw error
    }
  }

  async update(entity: BranchEntity) {
    // The code is the receipt prefix and never changes, so it is left out of the SET clause.
    const { id, code: _fixed, ...values } = entity.toSnapshot()
    const [row] = await currentExecutor().update(branches).set(values).where(eq(branches.id, id)).returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบสาขา', 'BRANCH_NOT_FOUND')
    return new BranchEntity(row)
  }

  async countActive() {
    const [row] = await currentExecutor().select({ total: count() }).from(branches).where(eq(branches.isActive, true))
    return row!.total
  }
}
