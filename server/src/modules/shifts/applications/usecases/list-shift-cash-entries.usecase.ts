import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { cashEntryListSchema } from '../schemas/shift-schemas'

/** Query. */
@injectable()
export class ListShiftCashEntriesUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  async execute(shiftId: number, input: unknown, branchId: number) {
    const dto = cashEntryListSchema.parse(input)
    if (!(await this.shifts.findById(shiftId, branchId))) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    return this.shifts.listCashEntries(shiftId, dto.limit, dto.offset)
  }
}
