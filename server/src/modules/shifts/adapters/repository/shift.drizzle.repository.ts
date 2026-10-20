import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainError } from '../../../../domains/errors/domain-error'
import { ShiftCashEntryEntity } from '../../../../domains/shift-cash-entry.domain'
import { ShiftEntity } from '../../../../domains/shift.domain'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'
import { shiftCashEntries } from '../../../../infrastructure/database/schema/shift-cash-entries'
import { shifts } from '../../../../infrastructure/database/schema/shifts'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { isUniqueViolation, violatedConstraint } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShiftRepository, ShiftListQuery } from '../../applications/ports/shift.repository'

const shiftColumns = {
  id: shifts.id,
  branchId: shifts.branchId,
  registerId: shifts.registerId,
  status: shifts.status,
  openedAt: shifts.openedAt,
  openedById: shifts.openedById,
  openedByName: shifts.openedByName,
  openingCashSatang: shifts.openingCashSatang,
  openingNote: shifts.openingNote,
  currency: shifts.currency,
  timeZone: shifts.timeZone,
  closingRevision: shifts.closingRevision,
  closingStartedAt: shifts.closingStartedAt,
  closingStartedById: shifts.closingStartedById,
  closingStartedByName: shifts.closingStartedByName,
  closingExpectedCashSatang: shifts.closingExpectedCashSatang,
  closedAt: shifts.closedAt,
  closedById: shifts.closedById,
  closedByName: shifts.closedByName,
  countedCashSatang: shifts.countedCashSatang,
  cashDifferenceSatang: shifts.cashDifferenceSatang,
  differenceReason: shifts.differenceReason,
}

const cashEntryColumns = {
  id: shiftCashEntries.id,
  shiftId: shiftCashEntries.shiftId,
  kind: shiftCashEntries.kind,
  amountSatang: shiftCashEntries.amountSatang,
  saleId: shiftCashEntries.saleId,
  actorId: shiftCashEntries.actorId,
  actorName: shiftCashEntries.actorName,
  reason: shiftCashEntries.reason,
  createdAt: shiftCashEntries.createdAt,
}

@injectable()
export class DrizzleShiftRepository implements IShiftRepository {
  async create(shift: ShiftEntity) {
    const { id: _id, ...values } = shift.toSnapshot()
    const [row] = await currentExecutor().insert(shifts).values(values).returning(shiftColumns)
    return new ShiftEntity(row!)
  }

  async findById(id: number, branchId: number) {
    const [row] = await currentExecutor().select(shiftColumns).from(shifts).where(and(eq(shifts.id, id), eq(shifts.branchId, branchId)))
    return row ? new ShiftEntity(row) : null
  }

  async findByIdForUpdate(id: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(shiftColumns)
      .from(shifts)
      .where(and(eq(shifts.id, id), eq(shifts.branchId, branchId)))
      .for('update')
    return row ? new ShiftEntity(row) : null
  }

  async findCurrentByRegister(registerId: number, branchId: number) {
    const [row] = await currentExecutor()
      .select(shiftColumns)
      .from(shifts)
      .where(and(eq(shifts.registerId, registerId), eq(shifts.branchId, branchId), inArray(shifts.status, ['open', 'closing'])))
      .limit(1)
    return row ? new ShiftEntity(row) : null
  }

  async list(query: ShiftListQuery) {
    const filters = [eq(shifts.branchId, query.branchId)]
    if (query.registerId !== undefined) filters.push(eq(shifts.registerId, query.registerId))
    if (query.status !== undefined) filters.push(eq(shifts.status, query.status))
    if (query.from) filters.push(gte(shifts.openedAt, query.from))
    if (query.to) filters.push(lte(shifts.openedAt, query.to))
    const where = and(...filters)
    const [total] = await currentExecutor().select({ value: count() }).from(shifts).where(where)
    const rows = await currentExecutor()
      .select(shiftColumns)
      .from(shifts)
      .where(where)
      .orderBy(desc(shifts.openedAt), desc(shifts.id))
      .limit(query.limit)
      .offset(query.offset)
    return { items: rows.map((row) => new ShiftEntity(row)), total: total!.value }
  }

  async update(shift: ShiftEntity) {
    const { id, ...values } = shift.toSnapshot()
    const [row] = await currentExecutor().update(shifts).set(values).where(eq(shifts.id, id)).returning(shiftColumns)
    if (!row) throw new DomainNotFoundError('ไม่พบกะ', 'SHIFT_NOT_FOUND')
    return new ShiftEntity(row)
  }

  async cashDeltas(shiftId: number) {
    const [row] = await currentExecutor()
      .select({
        total: sql<string>`coalesce(sum(case when ${shiftCashEntries.kind} in ('cash_sale', 'cash_in') then ${shiftCashEntries.amountSatang} else -${shiftCashEntries.amountSatang} end), 0)::text`,
      })
      .from(shiftCashEntries)
      .where(eq(shiftCashEntries.shiftId, shiftId))
    const total = BigInt(row?.total ?? '0')
    if (total > BigInt(MAX_AMOUNT_SATANG) || total < BigInt(-MAX_AMOUNT_SATANG))
      throw new DomainError('ยอดเงินสดรวมของกะเกินขอบเขตที่ระบบรองรับ กรุณาปิดกะและเปิดกะใหม่', 'AMOUNT_TOO_LARGE')
    return total === 0n ? [] : [{ amountSatang: Number(total) }]
  }

  async addCashEntry(entry: ShiftCashEntryEntity) {
    const { id: _id, createdAt: _createdAt, ...values } = entry.toSnapshot()
    try {
      const [row] = await currentExecutor().insert(shiftCashEntries).values(values).returning(cashEntryColumns)
      return new ShiftCashEntryEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error) && violatedConstraint(error) === 'shift_cash_entries_one_refund_per_sale')
        throw new DomainConflictError('บิลนี้มีรายการคืนเงินสดแล้ว', 'SALE_ALREADY_REFUNDED')
      throw error
    }
  }

  async hasCashRefund(saleId: number) {
    const [row] = await currentExecutor().select({ id: shiftCashEntries.id }).from(shiftCashEntries)
      .where(and(eq(shiftCashEntries.saleId, saleId), eq(shiftCashEntries.kind, 'cash_refund'))).limit(1)
    return row !== undefined
  }

  async listCashEntries(shiftId: number, limit: number, offset: number) {
    const where = eq(shiftCashEntries.shiftId, shiftId)
    const [total] = await currentExecutor().select({ value: count() }).from(shiftCashEntries).where(where)
    const rows = await currentExecutor()
      .select(cashEntryColumns)
      .from(shiftCashEntries)
      .where(where)
      .orderBy(desc(shiftCashEntries.createdAt), desc(shiftCashEntries.id))
      .limit(limit)
      .offset(offset)
    return { items: rows.map((row) => new ShiftCashEntryEntity(row)), total: total!.value }
  }
}
