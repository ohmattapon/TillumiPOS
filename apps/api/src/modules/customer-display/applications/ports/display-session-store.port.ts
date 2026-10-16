import type { DisplaySessionEntity, DisplayTarget } from '../../../../domains/display-session.domain'
import type { DisplayEnvelope } from '../schemas/display-schemas'

/**
 * The customer screens that exist and what each till last said. Held in the server's memory: a sale on the
 * counter is not shop data that has to outlive a restart. Async so a shared store can replace it.
 */
export interface IDisplaySessionStore {
  add(session: DisplaySessionEntity): Promise<void>
  save(session: DisplaySessionEntity): Promise<void>
  remove(sessionId: string): Promise<void>
  findByToken(token: string): Promise<DisplaySessionEntity | null>
  /** A screen that is still waiting and whose code has not run out. */
  findWaitingByCode(code: string, now: Date): Promise<DisplaySessionEntity | null>
  countWaiting(now: Date): Promise<number>
  /** Forgets waiting screens whose code has run out. */
  prune(now: Date): Promise<void>
  findPairedTo(target: DisplayTarget): Promise<DisplaySessionEntity[]>
  latestState(target: DisplayTarget): Promise<DisplayEnvelope | null>
  setLatestState(target: DisplayTarget, envelope: DisplayEnvelope): Promise<void>
  clearLatestState(target: DisplayTarget): Promise<void>
}

const displaySessionStoreTokenSymbol: unique symbol = Symbol('IDisplaySessionStore')
export const displaySessionStoreToken = displaySessionStoreTokenSymbol.toString()
