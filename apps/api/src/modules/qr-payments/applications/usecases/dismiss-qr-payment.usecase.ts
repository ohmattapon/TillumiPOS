import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { dismissQrPaymentSchema } from '../schemas/qr-payment-schemas'

/**
 * Command (owner): records that a paid QR will never get a sale here, with the reason, for example
 * because the money was returned at the bank. Without this a payment that cannot be sold against
 * would keep its shift from ever being counted. The payment stays on record as paid.
 */
@injectable()
export class DismissQrPaymentUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(id: number, input: unknown, actor: { id: number }, branchId: number) {
    const { reason } = dismissQrPaymentSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const payment = await this.payments.findByIdForUpdate(id)
      if (!payment || payment.branchId !== branchId)
        throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
      return this.payments.save(payment.dismiss(reason, actor.id, this.clock.now()))
    })
  }
}
