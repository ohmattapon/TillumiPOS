export type PinGuardCheck = 'ok' | 'locked'

/** Slows down guessing of a colleague's PIN: too many wrong tries lock that person's quick switch for a while. */
export interface IPinGuard {
  check(userId: number): PinGuardCheck
  recordFailure(userId: number): void
  recordSuccess(userId: number): void
}

const pinGuardTokenSymbol: unique symbol = Symbol('IPinGuard')
export const pinGuardToken = pinGuardTokenSymbol.toString()
