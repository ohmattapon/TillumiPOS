import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { QrPaymentRefresher } from '../services/qr-payment-refresher'

/**
 * Command: asks the bank about a pending payment and records the answer, so the first refresh after the
 * money arrives is the one that marks it paid. v2 exposes it as `POST .../refresh`. The v1
 * `GET /payments/qr/{id}` also calls it and stays a GET only because v1 cannot change; new code must
 * not read through it.
 */
@injectable()
export class RefreshQrPaymentUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(QrPaymentRefresher) private readonly refresher: QrPaymentRefresher,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, branchId: number) {
    return this.unitOfWork.run(async () => {
      const payment = await this.payments.findByIdForUpdate(id)
      if (!payment || payment.branchId !== branchId)
        throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
      return this.refresher.refresh(payment)
    })
  }
}
