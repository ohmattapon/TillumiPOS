import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'

export const QR_ATTEMPT_STATES = ['creating', 'ready', 'failed', 'unknown'] as const
export type QrAttemptState = (typeof QR_ATTEMPT_STATES)[number]

export interface NewQrAttempt {
  originShiftId: number
  branchId: number
  reference: string
  amountSatang: number
  actorId: number
  actorName: string
  idempotencyKey: string
}

export interface QrAttemptEntityProps extends NewQrAttempt {
  id: number
  state: QrAttemptState
  qrPaymentId: number | null
  qrImage: string | null
  createdAt: Date
}

/** How long a `creating` attempt is left alone: longer than any call to the bank can take. */
export const QR_ATTEMPT_STALE_AFTER_MS = 30_000

/**
 * One request to the bank for a QR, recorded before the call is made. `creating` and `unknown` mean
 * nobody knows yet whether the bank made a QR; they must be resolved, never just forgotten.
 * A QR in either state was never shown to a customer, so it cannot have been paid by scanning.
 */
export class QrAttemptEntity {
  public readonly id: number
  public readonly originShiftId: number
  public readonly branchId: number
  public readonly reference: string
  public readonly amountSatang: number
  public readonly actorId: number
  public readonly actorName: string
  public readonly idempotencyKey: string
  public readonly state: QrAttemptState
  public readonly qrPaymentId: number | null
  public readonly qrImage: string | null
  public readonly createdAt: Date

  constructor(props: QrAttemptEntityProps) {
    if (!QR_ATTEMPT_STATES.includes(props.state)) throw new DomainError('สถานะไม่ถูกต้อง', 'INVALID_QR_PAYMENT')
    if (props.state === 'ready' && props.qrPaymentId === null)
      throw new DomainError('รายการที่สำเร็จต้องมีรายการชำระ', 'INVALID_QR_PAYMENT')

    this.id = props.id
    this.originShiftId = props.originShiftId
    this.branchId = props.branchId
    this.reference = props.reference
    this.amountSatang = props.amountSatang
    this.actorId = props.actorId
    this.actorName = props.actorName
    this.idempotencyKey = props.idempotencyKey
    this.state = props.state
    this.qrPaymentId = props.qrPaymentId
    this.qrImage = props.qrImage
    this.createdAt = props.createdAt
  }

  /** Still blocks counting the shift: the outcome at the bank is not known. */
  get isUnresolved(): boolean {
    return this.state === 'creating' || this.state === 'unknown'
  }

  /** Whether the same key is being used for the same request. */
  matches(request: { originShiftId: number; amountSatang: number }): boolean {
    return this.originShiftId === request.originShiftId && this.amountSatang === request.amountSatang
  }

  /** The bank made the QR, or a payment for the reference was found. */
  ready(qrPaymentId: number, qrImage: string | null): QrAttemptEntity {
    this.assertUnresolved()
    return this.change({ state: 'ready', qrPaymentId, qrImage })
  }

  /** The bank refused, or was asked and knows nothing about the reference. */
  fail(): QrAttemptEntity {
    this.assertUnresolved()
    return this.change({ state: 'failed' })
  }

  /** The call went out and no answer came back. */
  outcomeUnknown(): QrAttemptEntity {
    if (this.state !== 'creating') throw new DomainConflictError('รายการนี้ทราบผลแล้ว', 'QR_ATTEMPT_RESOLVED')
    return this.change({ state: 'unknown' })
  }

  /**
   * Throws unless the attempt may be resolved now. A `creating` attempt may still be on its way to the
   * bank, so it is left alone until it is older than any such call can be.
   */
  assertResolvable(now: Date): void {
    this.assertUnresolved()
    if (this.state === 'creating' && now.getTime() - this.createdAt.getTime() < QR_ATTEMPT_STALE_AFTER_MS)
      throw new DomainConflictError('กำลังสร้าง QR อยู่ กรุณารอสักครู่แล้วลองใหม่', 'QR_ATTEMPT_IN_PROGRESS')
  }

  toSnapshot(): QrAttemptEntityProps {
    return {
      id: this.id,
      originShiftId: this.originShiftId,
      branchId: this.branchId,
      reference: this.reference,
      amountSatang: this.amountSatang,
      actorId: this.actorId,
      actorName: this.actorName,
      idempotencyKey: this.idempotencyKey,
      state: this.state,
      qrPaymentId: this.qrPaymentId,
      qrImage: this.qrImage,
      createdAt: this.createdAt,
    }
  }

  private assertUnresolved(): void {
    if (!this.isUnresolved) throw new DomainConflictError('รายการนี้ทราบผลแล้ว', 'QR_ATTEMPT_RESOLVED')
  }

  private change(changes: Partial<QrAttemptEntityProps>): QrAttemptEntity {
    return new QrAttemptEntity({ ...this.toSnapshot(), ...changes })
  }
}
