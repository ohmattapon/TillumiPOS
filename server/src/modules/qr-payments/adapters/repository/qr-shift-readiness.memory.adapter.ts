import { injectable } from 'tsyringe'
import type { IQrShiftReadiness, QrShiftReadiness } from '../../applications/ports/qr-shift-readiness.port'
import { MemoryQrAttemptRepository } from './qr-attempt.memory.repository'
import { MemoryQrPaymentRepository } from './qr-payment.memory.repository'

/**
 * Answers the shifts module's question from recorded state only and never
 * asks the bank, so it is safe to call while a shift is locked. The demo
 * composition root must hand this the same memory singletons the
 * qr-payments tokens get.
 */
@injectable()
export class MemoryQrShiftReadiness implements IQrShiftReadiness {
  constructor(
    private readonly attempts: MemoryQrAttemptRepository,
    private readonly payments: MemoryQrPaymentRepository,
  ) {}

  async forShift(shiftId: number): Promise<QrShiftReadiness> {
    const unresolvedAttempts = (await this.attempts.findByShift(shiftId)).filter(
      (attempt) => attempt.state === 'creating' || attempt.state === 'unknown',
    ).length
    const recorded = await this.payments.findByShift(shiftId)
    const pending = recorded.filter((payment) => payment.status === 'pending')
    return {
      unresolvedAttempts,
      paidUnclaimed: recorded.filter((payment) => payment.isUnclaimed).length,
      pending: {
        count: pending.length,
        amountSatang: pending.reduce((total, payment) => total + payment.amountSatang, 0),
      },
    }
  }
}
