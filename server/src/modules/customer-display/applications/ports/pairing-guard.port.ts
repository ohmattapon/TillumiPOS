export type PairingGuardCheck = 'ok' | 'locked'

/** Slows down guessing of pairing codes: a user who keeps typing wrong ones is locked out for a while. */
export interface IPairingGuard {
  check(userId: number): PairingGuardCheck
  recordFailure(userId: number): void
  recordSuccess(userId: number): void
}

const pairingGuardTokenSymbol: unique symbol = Symbol('IPairingGuard')
export const pairingGuardToken = pairingGuardTokenSymbol.toString()

/** Makes the unguessable parts of a screen: its id, the token only it holds, and the code typed at the till. */
export interface IDisplayIdentifiers {
  newId(): string
  newToken(): string
  /** Six digits. Not unique by itself: the caller checks it against the screens that wait. */
  newCode(): string
}

const displayIdentifiersTokenSymbol: unique symbol = Symbol('IDisplayIdentifiers')
export const displayIdentifiersToken = displayIdentifiersTokenSymbol.toString()
