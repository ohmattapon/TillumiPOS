import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'

/** Query. */
@injectable()
export class GetShiftUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  async execute(id: number, branchId: number) {
    const shift = await this.shifts.findById(id, branchId)
    if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    return shift
  }
}
