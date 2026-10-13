import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { QrPaymentRefresher } from '../services/qr-payment-refresher'

/**
 * Command: stops waiting for a QR. The bank is asked one last time first, so a customer who has
 * just paid is not told their payment was cancelled.
 */
@injectable()
export class CancelQrPaymentUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(QrPaymentRefresher) private readonly refresher: QrPaymentRefresher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const found = await this.payments.findByIdForUpdate(id)
      if (!found || found.branchId !== branchId)
        throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')

      const payment = await this.refresher.refresh(found, { force: true })
      // Throws QR_ALREADY_PAID when the check above found the money.
      return this.payments.save(payment.cancel())
    })
  }
}
