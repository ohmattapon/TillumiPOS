import { inject, injectable } from 'tsyringe'
import type { QrAttemptEntity } from '../../../../domains/qr-attempt.domain'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { TOKENS } from '../../../tokens'
import { qrAttemptRepositoryToken } from '../ports/qr-attempt.repository'
import type { IQrAttemptRepository } from '../ports/qr-attempt.repository'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { QR_VALID_FOR_MS } from './create-qr-payment.usecase'

/**
 * Command: settles a QR request whose outcome was never learned, by asking the bank. If the bank has a
 * payment for the reference it is recorded as paid, waiting for a sale. If the bank knows of none, the
 * attempt is closed as failed: its QR was never shown to anyone, so nobody can still pay it.
 * A bank that cannot be reached leaves the attempt as it was: a timeout alone proves nothing.
 */
@injectable()
export class ResolveQrAttemptUseCase {
  constructor(
    @inject(qrAttemptRepositoryToken) private readonly attempts: IQrAttemptRepository,
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
  ) {}

  async execute(id: number, actor: { id: number }, branchId: number) {
    return this.unitOfWork.run(async () => {
      const attempt = await this.attempts.findByIdForUpdate(id)
      if (!attempt || attempt.branchId !== branchId)
        throw new DomainNotFoundError('ไม่พบรายการขอ QR', 'QR_ATTEMPT_NOT_FOUND')
      const now = this.clock.now()
      attempt.assertResolvable(now)

      // Throws when the bank cannot be reached, which leaves the attempt untouched.
      const found = await this.gateway.findPayment({
        reference: attempt.reference,
        amountSatang: attempt.amountSatang,
        since: attempt.createdAt,
      })
      if (!found) {
        // The QR was never shown to anyone, so the quote it held is open again.
        await this.quotes.releaseByReference(attempt.reference)
        return this.attempts.save(attempt.fail())
      }
      return this.recordRecovered(attempt, found, actor.id, now)
    })
  }

  private async recordRecovered(
    attempt: QrAttemptEntity,
    found: NonNullable<Awaited<ReturnType<IQrPaymentGateway['findPayment']>>>,
    actorId: number,
    now: Date,
  ) {
    const payment = await this.payments.create({
      branchId: attempt.branchId,
      reference: attempt.reference,
      amountSatang: attempt.amountSatang,
      // The payload was never received; the money is what matters now.
      qrRawData: '',
      expiresAt: new Date(now.getTime() + QR_VALID_FOR_MS),
      createdById: actorId,
      originShiftId: attempt.originShiftId,
    })
    await this.payments.save(payment.markPaid(found).checked(now))
    return this.attempts.save(attempt.ready(payment.id, null))
  }
}
