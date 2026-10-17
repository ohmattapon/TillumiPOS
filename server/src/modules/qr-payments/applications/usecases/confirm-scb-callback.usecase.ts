import { inject, injectable } from 'tsyringe'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { scbConfirmationSchema } from '../schemas/qr-payment-schemas'
import { QrPaymentRefresher } from '../services/qr-payment-refresher'

/**
 * Command: SCB says a payment arrived. SCB signs nothing, so the body is only a hint of which QR to
 * check: the payment is marked paid only if SCB's own inquiry, an authenticated call from here,
 * confirms it. A forged callback therefore changes nothing.
 */
@injectable()
export class ConfirmScbCallbackUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(QrPaymentRefresher) private readonly refresher: QrPaymentRefresher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  /** Returns the transaction id to echo back. Unknown references are acknowledged too, so SCB stops retrying. */
  async execute(input: unknown): Promise<{ transactionId: string }> {
    const body = scbConfirmationSchema.parse(input)

    if (body.billPaymentRef1)
      await this.unitOfWork.run(async () => {
        const payment = await this.payments.findByReferenceForUpdate(body.billPaymentRef1!)
        if (payment) await this.refresher.refresh(payment, { force: true })
      })

    return { transactionId: body.transactionId ?? '' }
  }
}
