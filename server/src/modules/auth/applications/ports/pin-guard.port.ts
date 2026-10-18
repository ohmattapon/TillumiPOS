export type PinGuardCheck = 'ok' | 'locked'

/** Slows down guessing of a colleague's PIN: too many tries lock that person's quick switch for a while. */
export interface IPinGuard {
  /**
   * Reserves one attempt, counted as a failure at once and synchronously, so parallel requests cannot all pass
   * before any failure is recorded. The fifth attempt locks the user; while locked the answer is 'locked'.
   */
  begin(userId: number): PinGuardCheck
  /** The PIN was right: forget the attempts counted so far, including the one this request began. */
  recordSuccess(userId: number): void
}

const pinGuardTokenSymbol: unique symbol = Symbol('IPinGuard')
export const pinGuardToken = pinGuardTokenSymbol.toString()
