import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { kbankConfirmationSchema } from '../schemas/qr-payment-schemas'
import { QrPaymentRefresher } from '../services/qr-payment-refresher'

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
  ) {}

  /** Returns the reference to echo back. Unknown references are acknowledged too, so KBank stops retrying. */
  async execute(input: unknown): Promise<{ partnerTxnUid: string }> {
    const body = kbankConfirmationSchema.parse(input)

    if (body.partnerTxnUid)
      await this.unitOfWork.run(async () => {
        const payment = await this.payments.findByReferenceForUpdate(body.partnerTxnUid!)
        if (payment) await this.refresher.refresh(payment, { force: true })
      })

    return { partnerTxnUid: body.partnerTxnUid ?? '' }
  }
}
