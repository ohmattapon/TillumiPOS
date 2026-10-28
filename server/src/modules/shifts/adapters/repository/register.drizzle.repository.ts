import { and, eq, inArray } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { RegisterEntity } from '../../../../domains/register.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { registers } from '../../../../infrastructure/database/schema/registers'
import { shifts } from '../../../../infrastructure/database/schema/shifts'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IRegisterRepository } from '../../applications/ports/register.repository'

const columns = {
  id: registers.id,
  branchId: registers.branchId,
  code: registers.code,
  name: registers.name,
  isActive: registers.isActive,
}

const duplicateCode = () => new DomainConflictError('รหัสจุดขายนี้มีอยู่แล้วในสาขา', 'REGISTER_CODE_TAKEN')

@injectable()
export class DrizzleRegisterRepository implements IRegisterRepository {
  async findAll(branchId: number) {
    const rows = await currentExecutor().select(columns).from(registers).where(eq(registers.branchId, branchId)).orderBy(registers.code)
    return rows.map((row) => new RegisterEntity(row))
  }

  async findById(id: number, branchId: number) {
    const [row] = await currentExecutor().select(columns).from(registers).where(and(eq(registers.id, id), eq(registers.branchId, branchId)))
    return row ? new RegisterEntity(row) : null
  }

  async findByIdForUpdate(id: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(columns)
      .from(registers)
      .where(and(eq(registers.id, id), eq(registers.branchId, branchId)))
      .for('update')
    return row ? new RegisterEntity(row) : null
  }

  async create(entity: RegisterEntity) {
    const { id: _id, ...values } = entity.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(registers).values(values).returning(columns)
      return new RegisterEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateCode()
      throw error
    }
  }

  async update(entity: RegisterEntity) {
    const { id, branchId: _branch, code: _code, ...values } = entity.toSnapshot()
    // The code is not in the SET clause, so this cannot break the unique (branch, code) index.
    const [row] = await currentExecutor().update(registers).set(values).where(eq(registers.id, id)).returning(columns)
    if (!row) throw new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')
    return new RegisterEntity(row)
  }

  async hasOpenShift(registerId: number) {
    const [row] = await currentExecutor()
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.registerId, registerId), inArray(shifts.status, ['open', 'closing'])))
      .limit(1)
    return row !== undefined
  }

  async createMainForBranch(branchId: number) {
    await currentExecutor()
      .insert(registers)
      .values({ branchId, code: 'MAIN', name: 'เคาน์เตอร์หลัก', isActive: true })
      .onConflictDoNothing({ target: [registers.branchId, registers.code] })
  }
}
