import { inject, injectable } from 'tsyringe'
import { qrAttemptRepositoryToken } from '../ports/qr-attempt.repository'
import type { IQrAttemptRepository } from '../ports/qr-attempt.repository'
import { qrPageSchema } from '../schemas/qr-payment-schemas'

/** Query: QR requests of the branch whose outcome at the bank is still not known. */
@injectable()
export class ListUnresolvedQrAttemptsUseCase {
  constructor(@inject(qrAttemptRepositoryToken) private readonly attempts: IQrAttemptRepository) {}

  async execute(input: unknown, branchId: number) {
    return this.attempts.findUnresolved({ ...qrPageSchema.parse(input), branchId })
  }
}
