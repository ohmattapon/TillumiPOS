import { inject, injectable } from 'tsyringe'
import { quoteClaimsToken, type IQuoteClaims } from '../../../quotes/applications/ports/quote-claims.port'
import { qrPaymentRepositoryToken, type IQrPaymentRepository } from '../ports/qr-payment.repository'

/**
 * Query: the QR that holds the price of an open order, if any. The till shows it while the order is locked,
 * and cancels it from there. Writes nothing.
 */
@injectable()
export class FindOrderQrHoldUseCase {
  constructor(
    @inject(qrPaymentRepositoryToken) private readonly payments: IQrPaymentRepository,
    @inject(quoteClaimsToken) private readonly quotes: IQuoteClaims,
  ) {}

  async execute(orderId: number, branchId: number) {
    const reference = await this.quotes.findHeldByOrder(orderId, branchId)
    if (reference === null) return null
    const payment = await this.payments.findByReference(reference)
    // A QR that was cancelled holds nothing the till should show; only a pending or paid one is held.
    if (!payment || payment.branchId !== branchId || payment.status === 'cancelled') return null
    return { id: payment.id, status: payment.status, amountSatang: payment.amountSatang, expiresAt: payment.expiresAt }
  }
}
