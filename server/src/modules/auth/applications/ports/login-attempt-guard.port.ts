export type LoginAttemptCheck = 'ok' | 'locked'

/** Slows down guessing of a password: too many failures lock that name's login for a while. */
export interface ILoginAttemptGuard {
  /**
   * Reserves one attempt for the normalized username, counted as a failure at once and synchronously,
   * so parallel requests cannot all pass before any failure is recorded. The fifth attempt locks the
   * name; while locked the answer is 'locked'. Unknown names are never counted: without an account
   * there is nothing to break into, and counting them would let anyone lock anyone's login.
   */
  begin(username: string): LoginAttemptCheck
  /** The password was right: forget the attempts counted so far, including the one this request began. */
  recordSuccess(username: string): void
}

const loginAttemptGuardTokenSymbol: unique symbol = Symbol('ILoginAttemptGuard')
export const loginAttemptGuardToken = loginAttemptGuardTokenSymbol.toString()
