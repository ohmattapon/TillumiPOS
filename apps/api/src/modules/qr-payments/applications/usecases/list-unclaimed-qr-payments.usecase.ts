import { inject, injectable } from 'tsyringe'
import { qrPaymentRepositoryToken } from '../ports/qr-payment.repository'
import type { IQrPaymentRepository } from '../ports/qr-payment.repository'
import { qrPageSchema } from '../schemas/qr-payment-schemas'

/**
 * Query: money the bank confirmed that has no sale yet, for the whole branch. It outlives the screen
 * and the shift that asked for the QR, so a late payment is never lost with a closed dialog.
 */
@injectable()
export class ListUnclaimedQrPaymentsUseCase {
  constructor(@inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository) {}

  async execute(input: unknown, branchId: number) {
    return this.payments.findUnclaimed({ ...qrPageSchema.parse(input), branchId })
  }
}
