export type SetupCodeCheck = 'accepted' | 'wrong' | 'locked' | 'not-issued'

/**
 * The one-time code that proves a person can read the server's log, which is what lets them make the
 * first owner. Held in memory: a restart issues a new one, and nothing is stored on disk.
 */
export interface ISetupCode {
  /** Makes a new code, forgetting the old one and any failed attempts, and returns it. */
  issue(): string
  verify(candidate: string): SetupCodeCheck
  /** Forgets the code once the shop is set up. */
  retire(): void
}

const setupCodeTokenSymbol: unique symbol = Symbol('ISetupCode')
export const setupCodeToken = setupCodeTokenSymbol.toString()
