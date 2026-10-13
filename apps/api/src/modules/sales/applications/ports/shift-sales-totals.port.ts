import type { ShiftSalesTotals } from '../../../../domains/shift-summary'

/**
 * Query port for the shifts module: what the sales recorded in one shift add up to.
 * Shifts never read the sales tables themselves.
 */
export interface IShiftSalesTotals {
  forShift(shiftId: number): Promise<ShiftSalesTotals>
}

const token: unique symbol = Symbol('IShiftSalesTotals')
export const shiftSalesTotalsToken = token.toString()
