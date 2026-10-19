import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'
import { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import { shiftRepositoryToken, type IShiftRepository } from '../../applications/ports/shift.repository'

const missing = () => new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
const notOpenForCheckout = () => new DomainConflictError('กะนี้ไม่ได้เปิดรับชำระอยู่', 'SHIFT_NOT_OPEN')
const tooLarge = () =>
  new DomainError('ยอดเงินสดรวมของกะเกินขอบเขตที่ระบบรองรับ กรุณาปิดกะและเปิดกะใหม่', 'AMOUNT_TOO_LARGE')

/**
 * Checkout-facing drawer writes over the shift module's own repository
 * through its port. Sales never read shift tables or adapters directly.
 */
@injectable()
export class MemoryShiftLedgerAdapter implements IShiftLedger {
  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}

  async assertOpenForCheckout(shiftId: number, branchId: number) {
    // The lock is a no-op in memory; the check itself is the same.
    const shift = await this.shifts.findByIdForUpdate(shiftId, branchId)
    if (!shift) throw missing()
    if (shift.status !== 'open') throw notOpenForCheckout()
  }

  async recordSaleCash(input: {
    shiftId: number
    branchId: number
    saleId: number
    receiptNo: string
    actorId: number
    actorName: string
    amountSatang: number
    createdAt: Date
  }) {
    if (input.amountSatang <= 0) return
    if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang > MAX_AMOUNT_SATANG) throw tooLarge()
    const shift = await this.shifts.findByIdForUpdate(input.shiftId, input.branchId)
    if (!shift) throw missing()
    if (shift.status !== 'open') throw notOpenForCheckout()
    const [ledger] = await this.shifts.cashDeltas(input.shiftId)
    const expected = BigInt(shift.openingCashSatang) + BigInt(ledger?.amountSatang ?? 0) + BigInt(input.amountSatang)
    if (expected > BigInt(MAX_AMOUNT_SATANG)) throw tooLarge()
    // The entry keeps the sale's moment, like the drizzle twin's explicit createdAt.
    await this.shifts.addCashEntry(
      new ShiftCashEntryEntity({
        id: 0,
        shiftId: input.shiftId,
        kind: 'cash_sale',
        amountSatang: input.amountSatang,
        saleId: input.saleId,
        actorId: input.actorId,
        actorName: input.actorName,
        reason: null,
        createdAt: input.createdAt,
      }),
    )
  }

  async recordSaleRefund(input: {
    shiftId: number
    branchId: number
    saleId: number
    actorId: number
    actorName: string
    amountSatang: number
    reason: string
    createdAt: Date
  }) {
    if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang < 1 || input.amountSatang > MAX_AMOUNT_SATANG)
      throw new DomainError('ยอดคืนเงินสดไม่ถูกต้อง', 'INVALID_CASH_REFUND')
    const shift = await this.shifts.findByIdForUpdate(input.shiftId, input.branchId)
    if (!shift) throw missing()
    if (shift.status !== 'open') throw new DomainConflictError('คืนเงินสดได้เฉพาะกะที่เปิดอยู่', 'SHIFT_NOT_OPEN')
    if (await this.hasRefund(input.shiftId, input.saleId))
      throw new DomainConflictError('บิลนี้มีรายการคืนเงินสดแล้ว', 'SALE_ALREADY_REFUNDED')
    const [ledger] = await this.shifts.cashDeltas(input.shiftId)
    if (BigInt(shift.openingCashSatang) + BigInt(ledger?.amountSatang ?? 0) - BigInt(input.amountSatang) < 0n)
      throw new DomainConflictError('เงินสดในกะไม่พอสำหรับคืนเงิน กรุณาตรวจยอดเงินก่อน', 'SHIFT_CASH_INSUFFICIENT')
    await this.shifts.addCashEntry(
      new ShiftCashEntryEntity({
        id: 0,
        shiftId: input.shiftId,
        kind: 'cash_refund',
        amountSatang: input.amountSatang,
        saleId: input.saleId,
        actorId: input.actorId,
        actorName: input.actorName,
        reason: input.reason,
        createdAt: input.createdAt,
      }),
    )
  }

  private async hasRefund(shiftId: number, saleId: number) {
    // One refund per sale, like the drizzle twin's partial unique index.
    let offset = 0
    for (;;) {
      const page = await this.shifts.listCashEntries(shiftId, 500, offset)
      if (page.items.some((entry) => entry.kind === 'cash_refund' && entry.saleId === saleId)) return true
      offset += page.items.length
      if (offset >= page.total) return false
    }
  }
}
