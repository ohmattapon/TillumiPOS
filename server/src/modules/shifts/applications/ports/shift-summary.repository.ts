import type { ShiftCashTotals, ShiftSummary } from '../../../../domains/shift-summary'

export interface FrozenShiftSummary {
  summary: ShiftSummary
  capturedAt: Date
}

export interface IShiftSummaryRepository {
  /** Drawer movements of the shift summed per kind. */
  cashTotals(shiftId: number): Promise<ShiftCashTotals>
  /** Stores the summary taken when counting starts, replacing one from an earlier, cancelled count. */
  freeze(shiftId: number, summary: ShiftSummary, capturedAt: Date): Promise<void>
  /** Drops the frozen summary when counting is cancelled and the shift goes back to selling. */
  discard(shiftId: number): Promise<void>
  findFrozen(shiftId: number): Promise<FrozenShiftSummary | null>
}

const token: unique symbol = Symbol('IShiftSummaryRepository')
export const shiftSummaryRepositoryToken = token.toString()
