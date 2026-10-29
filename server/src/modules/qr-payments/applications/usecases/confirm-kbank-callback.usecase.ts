import { inject, injectable } from 'tsyringe'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { kbankConfirmationSchema } from '../schemas/qr-payment-schemas'
import { QrPaymentRefresher } from '../services/qr-payment-refresher'

/**
 * The callback is public and unsigned, so anyone who knows a reference could make us lock the row and
 * call the bank on every request. A callback inside this window of the last check is acknowledged and
 * skipped: the screen keeps polling, so a real payment is still found by the next check.
 */
export const CALLBACK_MIN_CHECK_INTERVAL_MS = 1000

/**
 * Command: KBank says a payment arrived. KBank signs nothing, so the body is only a hint of which QR
 * to check: the payment is marked paid only if KBank's own inquiry, an authenticated call from here,
 * confirms it. A forged callback therefore changes nothing.
 */
@injectable()
export class ConfirmKbankCallbackUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(QrPaymentRefresher) private readonly refresher: QrPaymentRefresher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  /** Returns the reference to echo back. Unknown references are acknowledged too, so KBank stops retrying. */
  async execute(input: unknown): Promise<{ partnerTxnUid: string }> {
    const body = kbankConfirmationSchema.parse(input)

    if (body.partnerTxnUid)
      await this.unitOfWork.run(async () => {
        const payment = await this.payments.findByReferenceForUpdate(body.partnerTxnUid!)
        if (payment && payment.isDueForCheck(this.clock.now(), CALLBACK_MIN_CHECK_INTERVAL_MS))
          await this.refresher.refresh(payment, { force: true })
      })

    return { partnerTxnUid: body.partnerTxnUid ?? '' }
  }
}
