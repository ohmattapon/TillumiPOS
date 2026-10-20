import { inject, injectable } from 'tsyringe'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'
import { shiftListSchema } from '../schemas/shift-schemas'

/** Query. */
@injectable()
export class ListShiftsUseCase {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}
  execute(input: unknown, branchId: number) {
    const dto = shiftListSchema.parse(input)
    return this.shifts.list({ ...dto, branchId })
  }
}
