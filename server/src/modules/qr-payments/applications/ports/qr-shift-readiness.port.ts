/** What a shift still has open with the bank. */
export interface QrShiftReadiness {
  /** QR requests whose outcome at the bank is not known. They must be resolved before counting. */
  unresolvedAttempts: number
  /** Payments the bank confirmed that have no sale yet. They must get a sale or be dismissed first. */
  paidUnclaimed: number
  /** QRs made and not paid. Counting may start, but the bank will still accept a payment for them. */
  pending: { count: number; amountSatang: number }
}

/**
 * Query port for the shifts module: what stands between a shift and counting its drawer.
 * It reads recorded state only and never asks the bank, so it is safe to call while a shift is locked.
 */
export interface IQrShiftReadiness {
  forShift(shiftId: number): Promise<QrShiftReadiness>
}

const token: unique symbol = Symbol('IQrShiftReadiness')
export const qrShiftReadinessToken = token.toString()
