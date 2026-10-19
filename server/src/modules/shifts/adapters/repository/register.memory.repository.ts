import { inject, injectable } from 'tsyringe'
import { RegisterEntity, type RegisterProps } from '../../../../domains/register.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { shiftRepositoryToken, type IShiftRepository } from '../../applications/ports/shift.repository'
import type { IRegisterRepository } from '../../applications/ports/register.repository'

// Same codes and messages the API has always answered for these conflicts.
const duplicateCode = () => new DomainConflictError('รหัสจุดขายนี้มีอยู่แล้วในสาขา', 'REGISTER_CODE_TAKEN')
const missing = () => new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')

/**
 * No-database register store: one Map, ids assigned from 1 in creation
 * order. Whether a drawer is open is answered by the shift module's own
 * repository through its port, from the register's own branch.
 */
@injectable()
export class MemoryRegisterRepository implements IRegisterRepository {
  private readonly rows = new Map<number, RegisterProps>()
  private nextId = 1

  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}

  async findAll(branchId: number) {
    return [...this.rows.values()]
      .filter((row) => row.branchId === branchId)
      .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
      .map((row) => new RegisterEntity(row))
  }

  async findById(id: number, branchId: number) {
    const row = this.rows.get(id)
    return row && row.branchId === branchId ? new RegisterEntity(row) : null
  }

  async findByIdForUpdate(id: number, branchId: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id, branchId)
  }

  async create(entity: RegisterEntity) {
    if ([...this.rows.values()].some((row) => row.branchId === entity.branchId && row.code === entity.code))
      throw duplicateCode()
    const stored: RegisterProps = { ...entity.toSnapshot(), id: this.nextId++ }
    this.rows.set(stored.id, stored)
    return new RegisterEntity(stored)
  }

  async update(entity: RegisterEntity) {
    const stored = this.rows.get(entity.id)
    if (!stored) throw missing()
    // The branch and code never change, like the drizzle twin's SET clause.
    const next: RegisterProps = {
      ...entity.toSnapshot(),
      id: stored.id,
      branchId: stored.branchId,
      code: stored.code,
    }
    this.rows.set(next.id, next)
    return new RegisterEntity(next)
  }

  async hasOpenShift(registerId: number) {
    const register = this.rows.get(registerId)
    if (!register) return false
    return (await this.shifts.findCurrentByRegister(registerId, register.branchId)) !== null
  }

  async createMainForBranch(branchId: number) {
    if ([...this.rows.values()].some((row) => row.branchId === branchId && row.code === 'MAIN')) return
    const stored: RegisterProps = { id: this.nextId++, branchId, code: 'MAIN', name: 'เคาน์เตอร์หลัก', isActive: true }
    this.rows.set(stored.id, stored)
  }
}
