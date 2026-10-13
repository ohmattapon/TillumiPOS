import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

export const SHIFT_CASH_ENTRY_KINDS = ['cash_sale', 'cash_in', 'cash_out', 'cash_refund'] as const
export type ShiftCashEntryKind = (typeof SHIFT_CASH_ENTRY_KINDS)[number]

export interface ShiftCashEntryProps {
  id: number
  shiftId: number
  kind: ShiftCashEntryKind
  amountSatang: number
  saleId: number | null
  actorId: number
  actorName: string
  reason: string | null
  createdAt: Date
}

export class ShiftCashEntryEntity {
  readonly id: number
  readonly shiftId: number
  readonly kind: ShiftCashEntryKind
  readonly amountSatang: number
  readonly saleId: number | null
  readonly actorId: number
  readonly actorName: string
  readonly reason: string | null
  readonly createdAt: Date

  constructor(props: ShiftCashEntryProps) {
    if (!SHIFT_CASH_ENTRY_KINDS.includes(props.kind)) throw new DomainError('ประเภทรายการเงินสดไม่ถูกต้อง', 'INVALID_CASH_ENTRY')
    if (!Number.isSafeInteger(props.amountSatang) || props.amountSatang < 1 || props.amountSatang > MAX_AMOUNT_SATANG)
      throw new DomainError('ยอดเงินต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ถึงยอดสูงสุดที่รองรับ', 'INVALID_CASH_ENTRY_AMOUNT')
    if (props.kind === 'cash_refund' && props.saleId === null)
      throw new DomainError('รายการคืนเงินสดต้องอ้างอิงบิล', 'INVALID_CASH_REFUND')
    if ((props.kind === 'cash_in' || props.kind === 'cash_out') && (props.reason?.trim().length ?? 0) < 1)
      throw new DomainError('กรุณาระบุเหตุผลรายการเงินสด', 'CASH_ENTRY_REASON_REQUIRED')
    if (props.reason !== null && props.reason.length > 500)
      throw new DomainError('เหตุผลรายการเงินสดต้องไม่เกิน 500 ตัวอักษร', 'INVALID_CASH_ENTRY_REASON')
    this.id = props.id
    this.shiftId = props.shiftId
    this.kind = props.kind
    this.amountSatang = props.amountSatang
    this.saleId = props.saleId
    this.actorId = props.actorId
    this.actorName = props.actorName
    this.reason = props.reason?.trim() || null
    this.createdAt = props.createdAt
  }

  get signedDeltaSatang(): number {
    return this.kind === 'cash_sale' || this.kind === 'cash_in' ? this.amountSatang : -this.amountSatang
  }

  toSnapshot(): ShiftCashEntryProps {
    return {
      id: this.id,
      shiftId: this.shiftId,
      kind: this.kind,
      amountSatang: this.amountSatang,
      saleId: this.saleId,
      actorId: this.actorId,
      actorName: this.actorName,
      reason: this.reason,
      createdAt: this.createdAt,
    }
  }
}
