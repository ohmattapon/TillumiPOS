import type { Page } from '../../../../domains/page'
import type { ShiftEntity } from '../../../../domains/shift.domain'
import type { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'

export interface ShiftListQuery {
  branchId: number
  registerId?: number
  status?: 'open' | 'closing' | 'closed'
  from?: Date
  to?: Date
  limit: number
  offset: number
}

export interface IShiftRepository {
  create(shift: ShiftEntity): Promise<ShiftEntity>
  findById(id: number, branchId: number): Promise<ShiftEntity | null>
  findByIdForUpdate(id: number, branchId: number): Promise<ShiftEntity | null>
  findCurrentByRegister(registerId: number, branchId: number): Promise<ShiftEntity | null>
  list(query: ShiftListQuery): Promise<Page<ShiftEntity>>
  update(shift: ShiftEntity): Promise<ShiftEntity>
  cashDeltas(shiftId: number): Promise<readonly { amountSatang: number }[]>
  /** Throws SALE_ALREADY_REFUNDED when another refund of the same sale wins the race to the unique index. */
  addCashEntry(entry: ShiftCashEntryEntity): Promise<ShiftCashEntryEntity>
  hasCashRefund(saleId: number): Promise<boolean>
  listCashEntries(shiftId: number, limit: number, offset: number): Promise<Page<ShiftCashEntryEntity>>
}

const token: unique symbol = Symbol('IShiftRepository')
export const shiftRepositoryToken = token.toString()
