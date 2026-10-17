import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'
import { shifts } from '../../../../infrastructure/database/schema/shifts'
import { shiftCashEntries } from '../../../../infrastructure/database/schema/shift-cash-entries'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'

const columns = {
  id: shifts.id, branchId: shifts.branchId, registerId: shifts.registerId, status: shifts.status, openedAt: shifts.openedAt,
  openedById: shifts.openedById, openedByName: shifts.openedByName, openingCashSatang: shifts.openingCashSatang,
  openingNote: shifts.openingNote, currency: shifts.currency, timeZone: shifts.timeZone, closingRevision: shifts.closingRevision,
  closingStartedAt: shifts.closingStartedAt, closingStartedById: shifts.closingStartedById,
  closingStartedByName: shifts.closingStartedByName, closingExpectedCashSatang: shifts.closingExpectedCashSatang,
  closedAt: shifts.closedAt, closedById: shifts.closedById, closedByName: shifts.closedByName,
  countedCashSatang: shifts.countedCashSatang, cashDifferenceSatang: shifts.cashDifferenceSatang,
  differenceReason: shifts.differenceReason,
}

@injectable()
export class DrizzleShiftLedgerAdapter implements IShiftLedger {
  async assertOpenForCheckout(shiftId: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(columns).from(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.branchId, branchId)))
      .for('update')
    if (!row) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    if (row.status !== 'open') throw new DomainConflictError('กะนี้ไม่ได้เปิดรับชำระอยู่', 'SHIFT_NOT_OPEN')
  }

  async recordSaleCash(input: Parameters<IShiftLedger['recordSaleCash']>[0]) {
    if (input.amountSatang <= 0) return
    if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang > MAX_AMOUNT_SATANG)
      throw new DomainError('ยอดเงินสดรวมของกะเกินขอบเขตที่ระบบรองรับ กรุณาปิดกะและเปิดกะใหม่', 'AMOUNT_TOO_LARGE')
    const [row] = await currentExecutor()
      .select(columns).from(shifts)
      .where(and(eq(shifts.id, input.shiftId), eq(shifts.branchId, input.branchId)))
      .for('update')
    if (!row) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    if (row.status !== 'open') throw new DomainConflictError('กะนี้ไม่ได้เปิดรับชำระอยู่', 'SHIFT_NOT_OPEN')
    const [ledger] = await currentExecutor()
      .select({ total: sql<string>`coalesce(sum(case when ${shiftCashEntries.kind} in ('cash_sale', 'cash_in') then ${shiftCashEntries.amountSatang} else -${shiftCashEntries.amountSatang} end), 0)::text` })
      .from(shiftCashEntries).where(eq(shiftCashEntries.shiftId, input.shiftId))
    const expected = BigInt(row.openingCashSatang) + BigInt(ledger?.total ?? '0') + BigInt(input.amountSatang)
    if (expected > BigInt(MAX_AMOUNT_SATANG))
      throw new DomainError('ยอดเงินสดรวมของกะเกินขอบเขตที่ระบบรองรับ กรุณาปิดกะและเปิดกะใหม่', 'AMOUNT_TOO_LARGE')
    await currentExecutor().insert(shiftCashEntries).values({
      shiftId: input.shiftId, kind: 'cash_sale', amountSatang: input.amountSatang, saleId: input.saleId,
      actorId: input.actorId, actorName: input.actorName, reason: null, createdAt: input.createdAt,
    })
  }

  async recordSaleRefund(input: Parameters<IShiftLedger['recordSaleRefund']>[0]) {
    if (!Number.isSafeInteger(input.amountSatang) || input.amountSatang < 1 || input.amountSatang > MAX_AMOUNT_SATANG)
      throw new DomainError('ยอดคืนเงินสดไม่ถูกต้อง', 'INVALID_CASH_REFUND')
    const [row] = await currentExecutor().select(columns).from(shifts)
      .where(and(eq(shifts.id, input.shiftId), eq(shifts.branchId, input.branchId))).for('update')
    if (!row) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    if (row.status !== 'open') throw new DomainConflictError('คืนเงินสดได้เฉพาะกะที่เปิดอยู่', 'SHIFT_NOT_OPEN')
    const [existingRefund] = await currentExecutor().select({ id: shiftCashEntries.id }).from(shiftCashEntries)
      .where(and(eq(shiftCashEntries.saleId, input.saleId), eq(shiftCashEntries.kind, 'cash_refund'))).limit(1)
    if (existingRefund) throw new DomainConflictError('บิลนี้มีรายการคืนเงินสดแล้ว', 'SALE_ALREADY_REFUNDED')
    const [ledger] = await currentExecutor()
      .select({ total: sql<string>`coalesce(sum(case when ${shiftCashEntries.kind} in ('cash_sale', 'cash_in') then ${shiftCashEntries.amountSatang} else -${shiftCashEntries.amountSatang} end), 0)::text` })
      .from(shiftCashEntries).where(eq(shiftCashEntries.shiftId, input.shiftId))
    if (BigInt(row.openingCashSatang) + BigInt(ledger?.total ?? '0') - BigInt(input.amountSatang) < 0n)
      throw new DomainConflictError('เงินสดในกะไม่พอสำหรับคืนเงิน กรุณาตรวจยอดเงินก่อน', 'SHIFT_CASH_INSUFFICIENT')
    try {
      await currentExecutor().insert(shiftCashEntries).values({
        shiftId: input.shiftId, kind: 'cash_refund', amountSatang: input.amountSatang, saleId: input.saleId,
        actorId: input.actorId, actorName: input.actorName, reason: input.reason, createdAt: input.createdAt,
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'constraint' in error && error.constraint === 'shift_cash_entries_one_refund_per_sale')
        throw new DomainConflictError('บิลนี้มีรายการคืนเงินสดแล้ว', 'SALE_ALREADY_REFUNDED')
      throw error
    }
  }
}
