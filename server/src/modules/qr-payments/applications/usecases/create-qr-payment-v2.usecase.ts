import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { QrAttemptEntity } from '../../../../domains/qr-attempt.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import type { ICheckoutPolicy } from '../../../shared/ports/checkout-policy.port'
import type { IShiftLedger } from '../../../shared/ports/shift-ledger.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { TOKENS } from '../../../tokens'
import { qrAttemptRepositoryToken } from '../ports/qr-attempt.repository'
import type { IQrAttemptRepository } from '../ports/qr-attempt.repository'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { createQrPaymentV2Schema } from '../schemas/qr-payment-schemas'
import { QR_VALID_FOR_MS } from './create-qr-payment.usecase'

const unresolved = (attempt: QrAttemptEntity) =>
  new DomainConflictError(
    'ยังไม่ทราบผลการสร้าง QR ครั้งก่อน กรุณาตรวจสอบรายการที่ค้างก่อนสร้างใหม่',
    'QR_PAYMENT_UNRESOLVED',
    { attemptId: attempt.id },
  )

/**
 * Command: asks the bank for a QR on behalf of an open shift. The request is written down before the bank
 * is called, and the call is made outside the transaction that locks the shift, so that an interrupted
 * call (crash, timeout, lost answer) leaves an attempt to resolve instead of a QR nobody knows about.
 * The idempotency key is tied to that one attempt: retrying never asks the bank for a second QR.
 */
@injectable()
export class CreateQrPaymentV2UseCase {
  constructor(
    @inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway,
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(qrAttemptRepositoryToken) private readonly attempts: IQrAttemptRepository,
    @inject(TOKENS.ShiftLedger) private readonly shiftLedger: IShiftLedger,
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
  ) {}

  async execute(
    input: unknown,
    actor: { id: number; displayName: string },
    branch: { id: number; code: string },
    idempotencyKey: string,
  ) {
    const dto = createQrPaymentV2Schema.parse(input)
    const key = idempotencyKey.toLowerCase()
    if (!(await this.policy.isShiftsEnabled()))
      throw new DomainConflictError('ขอ QR ผ่านกะได้เมื่อ CHECKOUT_MODE=shifts', 'CHECKOUT_MODE_REQUIRED')
    if (!this.gateway.isEnabled())
      throw new DomainConflictError('ร้านนี้ยังไม่ได้ตั้งค่าการรับชำระด้วย QR', 'QR_NOT_CONFIGURED')

    // Step 1: reserve. The shift lock makes this and "start counting" take turns, and serializes retries.
    const reserved = await this.unitOfWork.run(async () => {
      await this.shiftLedger.assertOpenForCheckout(dto.shiftId, branch.id)

      const prior = await this.attempts.findByKey(actor.id, key)
      if (prior) return { prior }

      // Reference 1: 16 characters of A-Z and 0-9, unique, and unguessable.
      const reference = 'QR' + crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()
      // The quote is held under the same shift lock, so counting the shift cannot start between the two.
      if (dto.quoteId !== undefined)
        await this.quotes.reserveForQr(dto.quoteId, { branchId: branch.id, reference, amountSatang: dto.amountSatang })
      const attempt = await this.attempts.create({
        originShiftId: dto.shiftId,
        branchId: branch.id,
        reference,
        amountSatang: dto.amountSatang,
        actorId: actor.id,
        actorName: actor.displayName,
        idempotencyKey: key,
      })
      return { attempt }
    })

    if (reserved.prior) return this.replay(reserved.prior, { originShiftId: dto.shiftId, amountSatang: dto.amountSatang })
    const attempt = reserved.attempt

    // Step 2: the bank, with nothing locked.
    let qr
    try {
      qr = await this.gateway.createQr({
        reference: attempt.reference,
        amountSatang: attempt.amountSatang,
        branchCode: branch.code,
      })
    } catch (error) {
      if (!(error instanceof DomainExternalServiceError)) throw error
      if (error.params?.outcome !== 'unknown') {
        // The bank refused, or was never reached: there is no QR.
        await this.attempts.save(attempt.fail())
        // The bank never made a QR, so the quote goes back to being open. An unknown outcome keeps it held.
        await this.unitOfWork.run(() => this.quotes.releaseByReference(attempt.reference))
        throw error
      }
      await this.attempts.save(attempt.outcomeUnknown())
      throw new DomainExternalServiceError(
        'ไม่ทราบว่าธนาคารสร้าง QR แล้วหรือไม่ กรุณาตรวจสอบรายการที่ค้าง',
        'QR_PAYMENT_UNRESOLVED',
        { attemptId: attempt.id },
      )
    }

    // Step 3: record what the bank made.
    return this.unitOfWork.run(async () => {
      const payment = await this.payments.create({
        branchId: branch.id,
        reference: attempt.reference,
        amountSatang: attempt.amountSatang,
        qrRawData: qr.qrRawData,
        expiresAt: new Date(this.clock.now().getTime() + QR_VALID_FOR_MS),
        createdById: actor.id,
        originShiftId: attempt.originShiftId,
      })
      await this.attempts.save(attempt.ready(payment.id, qr.qrImage))
      return { payment, qrImage: qr.qrImage }
    })
  }

  /** The same key again: answer from what the first request left behind, without calling the bank. */
  private async replay(prior: QrAttemptEntity, request: { originShiftId: number; amountSatang: number }) {
    if (!prior.matches(request))
      throw new DomainConflictError('Idempotency-Key นี้ถูกใช้กับข้อมูลคำขอชุดอื่นแล้ว', 'IDEMPOTENCY_KEY_REUSED')
    if (prior.isUnresolved) throw unresolved(prior)
    if (prior.state === 'failed')
      throw new DomainExternalServiceError('การสร้าง QR ครั้งนี้ไม่สำเร็จ กรุณาสร้างใหม่', 'QR_GATEWAY_ERROR')

    const payment = await this.payments.findById(prior.qrPaymentId!)
    return { payment: payment!, qrImage: prior.qrImage ?? '' }
  }
}
