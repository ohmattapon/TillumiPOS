import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { registerRepositoryToken } from '../ports/register.repository'
import type { IRegisterRepository } from '../ports/register.repository'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'

/** Query. */
@injectable()
export class GetCurrentShiftUseCase {
  constructor(
    @inject(shiftRepositoryToken) private readonly shifts: IShiftRepository,
    @inject(registerRepositoryToken) private readonly registers: IRegisterRepository,
  ) {}
  async execute(registerId: number, branchId: number) {
    if (!(await this.registers.findById(registerId, branchId))) throw new DomainNotFoundError('ไม่พบจุดขาย', 'REGISTER_NOT_FOUND')
    return this.shifts.findCurrentByRegister(registerId, branchId)
  }
}
