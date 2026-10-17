import type { QrPaymentConfirmation } from '../../../../domains/qr-payment.domain'

export interface QrCode {
  /** The EMV payload a customer's banking app reads. */
  qrRawData: string
  /** The same QR as a base64 PNG, ready to show. */
  qrImage: string
}

/** The bank behind the QR. Everything that leaves the process for it goes through here. */
export interface IQrPaymentGateway {
  /** Whether QR payment is configured for this shop. */
  isEnabled(): boolean
  /**
   * Throws DomainExternalServiceError when the bank cannot be reached or refuses the request.
   * Its `params.outcome` is `'unknown'` when the request was sent and no usable answer came back,
   * so the bank may have made the QR; without it, no QR was made.
   */
  createQr(request: { reference: string; amountSatang: number; branchCode: string }): Promise<QrCode>
  /**
   * The payment the bank has actually received for this reference and amount, or null if none yet.
   * `since` is when the QR was made, so a payment made after midnight is still found.
   * Throws DomainExternalServiceError when the bank cannot be reached.
   */
  findPayment(request: { reference: string; amountSatang: number; since: Date }): Promise<QrPaymentConfirmation | null>
}

const qrPaymentGatewayTokenSymbol: unique symbol = Symbol('IQrPaymentGateway')
export const qrPaymentGatewayToken = qrPaymentGatewayTokenSymbol.toString()
