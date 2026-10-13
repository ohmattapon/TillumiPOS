/**
 * How a sale uses a QR payment. Kept apart from the rest of the module so sales depend only on
 * what they need: whether QR is required, and checking and using a confirmed payment.
 * Both calls belong inside the unit of work that stores the sale.
 */
export interface IQrPaymentClaims {
  /** True when a shop has QR payment configured: `promptpay` then has to be backed by a confirmed QR. */
  isRequired(): boolean
  /**
   * Throws unless the payment is confirmed by the bank, belongs to this branch, is unused, and is for
   * exactly `amountSatang`. Locks the payment so two sales cannot both use it.
   */
  assertClaimable(qrPaymentId: number, claim: { branchId: number; amountSatang: number }): Promise<void>
  /** Marks the payment as used by the sale. */
  consume(qrPaymentId: number, saleId: number): Promise<void>
}

const qrPaymentClaimsTokenSymbol: unique symbol = Symbol('IQrPaymentClaims')
export const qrPaymentClaimsToken = qrPaymentClaimsTokenSymbol.toString()
