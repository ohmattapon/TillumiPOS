import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'
import { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import { shiftRepositoryToken } from '../ports/shift.repository'
import type { IShiftRepository } from '../ports/shift.repository'

/** Answers the checkout: the shift's cash rules, with the repository only locking and storing. */
@injectable()
export class ShiftLedger implements IShiftLedger {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}

  async assertOpenForCheckout(shiftId: number, branchId: number) {
    await this.lockOpenShift(shiftId, branchId)
  }

  async recordSaleCash(input: Parameters<IShiftLedger['recordSaleCash']>[0]) {
    if (input.amountSatang <= 0) return
    const shift = await this.lockOpenShift(input.shiftId, input.branchId)
    // Throws AMOUNT_TOO_LARGE when the drawer would hold more than the system can count.
    shift.expectedCashSatang([...(await this.shifts.cashDeltas(shift.id)), { amountSatang: input.amountSatang }])
    await this.shifts.addCashEntry(new ShiftCashEntryEntity({
      id: 0, shiftId: shift.id, kind: 'cash_sale', amountSatang: input.amountSatang, saleId: input.saleId,
      actorId: input.actorId, actorName: input.actorName, reason: null, createdAt: input.createdAt,
    }))
  }

  async recordSaleRefund(input: Parameters<IShiftLedger['recordSaleRefund']>[0]) {
    if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang < 1 || input.amountSatang > MAX_AMOUNT_SATANG)
      throw new DomainError('ยอดคืนเงินสดไม่ถูกต้อง', 'INVALID_CASH_REFUND')
    const shift = await this.lockOpenShift(input.shiftId, input.branchId)
    if (await this.shifts.hasCashRefund(input.saleId))
      throw new DomainConflictError('บิลนี้มีรายการคืนเงินสดแล้ว', 'SALE_ALREADY_REFUNDED')
    shift.assertCashCoversRefund(await this.shifts.cashDeltas(shift.id), input.amountSatang)
    await this.shifts.addCashEntry(new ShiftCashEntryEntity({
      id: 0, shiftId: shift.id, kind: 'cash_refund', amountSatang: input.amountSatang, saleId: input.saleId,
      actorId: input.actorId, actorName: input.actorName, reason: input.reason, createdAt: input.createdAt,
    }))
  }

  /** The shift row is locked first so that sales and refunds of one shift queue behind each other. */
  private async lockOpenShift(shiftId: number, branchId: number) {
    const shift = await this.shifts.findByIdForUpdate(shiftId, branchId)
    if (!shift) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    shift.assertOpen()
    return shift
  }
}
