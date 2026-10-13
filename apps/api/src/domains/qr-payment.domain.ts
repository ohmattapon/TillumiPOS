import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { MAX_AMOUNT_SATANG } from './sale.domain'

export const QR_PAYMENT_STATUSES = ['pending', 'paid', 'cancelled'] as const
export type QrPaymentStatus = (typeof QR_PAYMENT_STATUSES)[number]

/** What the bank reported about a payment that really arrived. */
export interface QrPaymentConfirmation {
  transactionId: string
  amountSatang: number
  paidAt: Date
  payerName: string | null
}

export interface NewQrPayment {
  branchId: number
  /** Reference 1 sent to the bank: A-Z and 0-9 only, at most 20 characters. */
  reference: string
  amountSatang: number
  qrRawData: string
  expiresAt: Date
  createdById: number
}

export interface QrPaymentEntityProps extends NewQrPayment {
  /** 0 until the payment has been stored. */
  id: number
  status: QrPaymentStatus
  bankTransactionId: string | null
  payerName: string | null
  paidAt: Date | null
  lastCheckedAt: Date | null
  /** The sale this payment was used for. A payment can be used once. */
  saleId: number | null
  createdAt: Date
}

const REFERENCE_PATTERN = /^[A-Z0-9]{1,20}$/

const invalid = (message: string) => new DomainError(message, 'INVALID_QR_PAYMENT')

/**
 * A QR shown to a customer for an exact amount. It is paid only when the bank says so
 * (never because someone claims it), and once paid it can back one sale.
 */
export class QrPaymentEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly reference: string
  public readonly amountSatang: number
  public readonly qrRawData: string
  public readonly expiresAt: Date
  public readonly createdById: number
  public readonly status: QrPaymentStatus
  public readonly bankTransactionId: string | null
  public readonly payerName: string | null
  public readonly paidAt: Date | null
  public readonly lastCheckedAt: Date | null
  public readonly saleId: number | null
  public readonly createdAt: Date

  constructor(props: QrPaymentEntityProps) {
    if (!REFERENCE_PATTERN.test(props.reference)) throw invalid('รหัสอ้างอิงต้องเป็น A-Z หรือ 0-9 ยาวไม่เกิน 20 ตัว')
    if (!Number.isInteger(props.amountSatang) || props.amountSatang < 1 || props.amountSatang > MAX_AMOUNT_SATANG)
      throw invalid('ยอดเงินต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 1 ขึ้นไป และไม่เกินที่ระบบรองรับ')
    if (!QR_PAYMENT_STATUSES.includes(props.status)) throw invalid('สถานะไม่ถูกต้อง')
    if (props.status === 'paid' && (props.bankTransactionId === null || props.paidAt === null))
      throw invalid('รายการที่ชำระแล้วต้องมีเลขรายการจากธนาคารและเวลา')
    if (props.saleId !== null && props.status !== 'paid') throw invalid('ใช้ได้เฉพาะรายการที่ชำระแล้ว')

    this.id = props.id
    this.branchId = props.branchId
    this.reference = props.reference
    this.amountSatang = props.amountSatang
    this.qrRawData = props.qrRawData
    this.expiresAt = props.expiresAt
    this.createdById = props.createdById
    this.status = props.status
    this.bankTransactionId = props.bankTransactionId
    this.payerName = props.payerName
    this.paidAt = props.paidAt
    this.lastCheckedAt = props.lastCheckedAt
    this.saleId = props.saleId
    this.createdAt = props.createdAt
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime()
  }

  /** Whether enough time has passed since the bank was last asked. */
  isDueForCheck(now: Date, minIntervalMs: number): boolean {
    return this.lastCheckedAt === null || now.getTime() - this.lastCheckedAt.getTime() >= minIntervalMs
  }

  checked(at: Date): QrPaymentEntity {
    return this.change({ lastCheckedAt: at })
  }

  /**
   * Records the money the bank reported. Idempotent: confirming an already paid payment changes nothing.
   * It is applied even to a cancelled QR, because the money arrived and must not vanish from the books.
   */
  markPaid(confirmation: QrPaymentConfirmation): QrPaymentEntity {
    if (this.status === 'paid') return this
    if (confirmation.amountSatang !== this.amountSatang)
      throw new DomainConflictError('ยอดที่ธนาคารรับไม่ตรงกับยอดของ QR', 'QR_AMOUNT_MISMATCH')

    return this.change({
      status: 'paid',
      bankTransactionId: confirmation.transactionId,
      paidAt: confirmation.paidAt,
      payerName: confirmation.payerName,
    })
  }

  /** The cashier gave up waiting. Only a payment that has not arrived can be cancelled. */
  cancel(): QrPaymentEntity {
    if (this.status === 'paid') throw new DomainConflictError('ลูกค้าชำระแล้ว ยกเลิกไม่ได้', 'QR_ALREADY_PAID')
    return this.change({ status: 'cancelled' })
  }

  /** Throws unless this payment can back a sale of exactly `amountSatang`. */
  assertClaimable(amountSatang: number): void {
    if (this.status !== 'paid') throw new DomainConflictError('ธนาคารยังไม่ยืนยันการชำระรายการนี้', 'QR_NOT_PAID')
    if (this.saleId !== null) throw new DomainConflictError('การชำระนี้ถูกใช้กับบิลอื่นแล้ว', 'QR_ALREADY_USED')
    if (amountSatang !== this.amountSatang)
      throw new DomainError('ยอดชำระต้องเท่ากับยอดของ QR พอดี', 'QR_AMOUNT_MISMATCH')
  }

  /** Ties the payment to the sale it paid for. */
  consume(saleId: number): QrPaymentEntity {
    this.assertClaimable(this.amountSatang)
    return this.change({ saleId })
  }

  toSnapshot(): QrPaymentEntityProps {
    return {
      id: this.id,
      branchId: this.branchId,
      reference: this.reference,
      amountSatang: this.amountSatang,
      qrRawData: this.qrRawData,
      expiresAt: this.expiresAt,
      createdById: this.createdById,
      status: this.status,
      bankTransactionId: this.bankTransactionId,
      payerName: this.payerName,
      paidAt: this.paidAt,
      lastCheckedAt: this.lastCheckedAt,
      saleId: this.saleId,
      createdAt: this.createdAt,
    }
  }

  private change(changes: Partial<QrPaymentEntityProps>): QrPaymentEntity {
    return new QrPaymentEntity({ ...this.toSnapshot(), ...changes })
  }
}
