import { inject, injectable } from 'tsyringe'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import type { QrPaymentEntity } from '../../../../domains/qr-payment.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentGatewayToken } from '../ports/qr-payment-gateway.port'
import type { IQrPaymentGateway } from '../ports/qr-payment-gateway.port'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'

/** How often one payment may ask the bank, so a polling screen cannot hammer it. */
export const MIN_CHECK_INTERVAL_MS = 3000

/**
 * Asks the bank whether a payment has arrived and records the answer. The bank is the only source of
 * truth: nothing a client or a callback says can mark a payment paid. Call it inside a unit of work
 * with the payment row-locked, so two checks never record the same payment twice.
 */
@injectable()
export class QrPaymentRefresher {
  constructor(
    @inject(qrPaymentGatewayToken) private readonly gateway: IQrPaymentGateway,
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  /** `force` skips the throttle, for when the bank itself has just told us something happened. */
  async refresh(payment: QrPaymentEntity, { force = false } = {}): Promise<QrPaymentEntity> {
    if (payment.status === 'paid') return payment

    const now = this.clock.now()
    if (!force && !payment.isDueForCheck(now, MIN_CHECK_INTERVAL_MS)) return payment

    try {
      const found = await this.gateway.findPayment({
        reference: payment.reference,
        amountSatang: payment.amountSatang,
        since: payment.createdAt,
      })
      return this.payments.save((found ? payment.markPaid(found) : payment).checked(now))
    } catch (error) {
      // The bank being unreachable must not break the screen that is waiting: it stays pending and is asked again.
      if (!(error instanceof DomainExternalServiceError)) throw error
      console.warn(`QR payment ${payment.reference}: could not check with the bank (${error.code})`)
      return this.payments.save(payment.checked(now))
    }
  }
}
