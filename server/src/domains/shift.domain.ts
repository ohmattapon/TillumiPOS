import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

export type ShiftStatus = 'open' | 'closing' | 'closed'

export interface ShiftProps {
  id: number
  branchId: number
  registerId: number
  status: ShiftStatus
  openedAt: Date
  openedById: number
  openedByName: string
  openingCashSatang: number
  openingNote: string | null
  currency: string
  timeZone: string
  closingRevision: number
  closingStartedAt: Date | null
  closingStartedById: number | null
  closingStartedByName: string | null
  closingExpectedCashSatang: number | null
  closedAt: Date | null
  closedById: number | null
  closedByName: string | null
  countedCashSatang: number | null
  cashDifferenceSatang: number | null
  differenceReason: string | null
}

export interface CashDelta {
  amountSatang: number
}

const invalidAmount = () => new DomainError('ยอดเงินเกินกว่าที่ระบบรองรับ', 'AMOUNT_TOO_LARGE')
const isAmount = (amount: number) => Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT_SATANG

/** A shared drawer session. State changes return copies so closed snapshots cannot be edited in place. */
export class ShiftEntity {
  readonly id: number
  readonly branchId: number
  readonly registerId: number
  readonly status: ShiftStatus
  readonly openedAt: Date
  readonly openedById: number
  readonly openedByName: string
  readonly openingCashSatang: number
  readonly openingNote: string | null
  readonly currency: string
  readonly timeZone: string
  readonly closingRevision: number
  readonly closingStartedAt: Date | null
  readonly closingStartedById: number | null
  readonly closingStartedByName: string | null
  readonly closingExpectedCashSatang: number | null
  readonly closedAt: Date | null
  readonly closedById: number | null
  readonly closedByName: string | null
  readonly countedCashSatang: number | null
  readonly cashDifferenceSatang: number | null
  readonly differenceReason: string | null

  constructor(props: ShiftProps) {
    if (!isAmount(props.openingCashSatang)) throw invalidAmount()
    if (!Number.isInteger(props.closingRevision) || props.closingRevision < 0) throw new DomainError('รอบการนับเงินไม่ถูกต้อง', 'INVALID_SHIFT')
    this.id = props.id
    this.branchId = props.branchId
    this.registerId = props.registerId
    this.status = props.status
    this.openedAt = props.openedAt
    this.openedById = props.openedById
    this.openedByName = props.openedByName
    this.openingCashSatang = props.openingCashSatang
    this.openingNote = props.openingNote
    this.currency = props.currency
    this.timeZone = props.timeZone
    this.closingRevision = props.closingRevision
    this.closingStartedAt = props.closingStartedAt
    this.closingStartedById = props.closingStartedById
    this.closingStartedByName = props.closingStartedByName
    this.closingExpectedCashSatang = props.closingExpectedCashSatang
    this.closedAt = props.closedAt
    this.closedById = props.closedById
    this.closedByName = props.closedByName
    this.countedCashSatang = props.countedCashSatang
    this.cashDifferenceSatang = props.cashDifferenceSatang
    this.differenceReason = props.differenceReason
  }

  expectedCashSatang(entries: readonly CashDelta[]): number {
    let total = BigInt(this.openingCashSatang)
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.amountSatang) || Math.abs(entry.amountSatang) > MAX_AMOUNT_SATANG) throw invalidAmount()
      total += BigInt(entry.amountSatang)
    }
    if (total < 0n) throw new DomainConflictError('เงินสดในลิ้นชักไม่พอสำหรับรายการนี้', 'CASH_BALANCE_INSUFFICIENT')
    if (total > BigInt(MAX_AMOUNT_SATANG)) throw invalidAmount()
    return Number(total)
  }

  startClosing(actorId: number, actorName: string, at: Date, expectedCashSatang: number): ShiftEntity {
    if (this.status !== 'open') throw new DomainConflictError('กะนี้ไม่ได้เปิดอยู่', 'SHIFT_NOT_OPEN')
    if (!isAmount(expectedCashSatang)) throw invalidAmount()
    if (this.closingRevision >= Number.MAX_SAFE_INTEGER) throw new DomainError('รอบการนับเงินเกินขอบเขต', 'INVALID_SHIFT')
    return new ShiftEntity({
      ...this.toSnapshot(),
      status: 'closing',
      closingRevision: this.closingRevision + 1,
      closingStartedAt: at,
      closingStartedById: actorId,
      closingStartedByName: actorName,
      closingExpectedCashSatang: expectedCashSatang,
    })
  }

  cancelClosing(revision: number): ShiftEntity {
    this.assertClosingRevision(revision)
    return new ShiftEntity({
      ...this.toSnapshot(),
      status: 'open',
      closingStartedAt: null,
      closingStartedById: null,
      closingStartedByName: null,
      closingExpectedCashSatang: null,
    })
  }

  close(revision: number, countedCashSatang: number, reason: string, actorId: number, actorName: string, at: Date): ShiftEntity {
    this.assertClosingRevision(revision)
    if (!isAmount(countedCashSatang)) throw new DomainError('เงินที่นับต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึงยอดสูงสุดที่รองรับ', 'INVALID_COUNTED_CASH')
    if (this.closingExpectedCashSatang === null) throw new DomainError('ไม่พบยอดเงินสด ณ เวลาเริ่มนับ', 'INVALID_SHIFT')
    const difference = countedCashSatang - this.closingExpectedCashSatang
    if (difference !== 0 && (reason.trim().length < 1 || reason.length > 500))
      throw new DomainError('กรุณาระบุเหตุผลส่วนต่าง 1 ถึง 500 ตัวอักษร', 'SHIFT_DIFFERENCE_REASON_REQUIRED')
    if (difference === 0 && reason.length > 500) throw new DomainError('เหตุผลส่วนต่างต้องไม่เกิน 500 ตัวอักษร', 'INVALID_SHIFT_REASON')
    return new ShiftEntity({
      ...this.toSnapshot(),
      status: 'closed',
      closedAt: at,
      closedById: actorId,
      closedByName: actorName,
      countedCashSatang,
      cashDifferenceSatang: difference,
      differenceReason: difference === 0 ? null : reason.trim(),
    })
  }

  toSnapshot(): ShiftProps {
    return {
      id: this.id,
      branchId: this.branchId,
      registerId: this.registerId,
      status: this.status,
      openedAt: this.openedAt,
      openedById: this.openedById,
      openedByName: this.openedByName,
      openingCashSatang: this.openingCashSatang,
      openingNote: this.openingNote,
      currency: this.currency,
      timeZone: this.timeZone,
      closingRevision: this.closingRevision,
      closingStartedAt: this.closingStartedAt,
      closingStartedById: this.closingStartedById,
      closingStartedByName: this.closingStartedByName,
      closingExpectedCashSatang: this.closingExpectedCashSatang,
      closedAt: this.closedAt,
      closedById: this.closedById,
      closedByName: this.closedByName,
      countedCashSatang: this.countedCashSatang,
      cashDifferenceSatang: this.cashDifferenceSatang,
      differenceReason: this.differenceReason,
    }
  }

  private assertClosingRevision(revision: number) {
    if (this.status !== 'closing') throw new DomainConflictError('กะนี้ยังไม่อยู่ระหว่างนับเงิน', 'SHIFT_NOT_CLOSING')
    if (revision !== this.closingRevision) throw new DomainConflictError('รอบการนับเงินเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่', 'SHIFT_CLOSING_REVISION_MISMATCH')
  }
}
