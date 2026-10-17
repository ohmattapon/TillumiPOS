import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'

/** Query: the recorded state of a QR payment. It never asks the bank; refreshing is a command of its own. */
@injectable()
export class ReadQrPaymentUseCase {
  constructor(@inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository) {}

  async execute(id: number, branchId: number) {
    const payment = await this.payments.findById(id)
    if (!payment || payment.branchId !== branchId)
      throw new DomainNotFoundError('ไม่พบรายการชำระด้วย QR', 'QR_PAYMENT_NOT_FOUND')
    return payment
  }
}
