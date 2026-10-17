import type { DisplayEnvelope } from '../schemas/display-schemas'

/** What a customer screen is told over its stream. */
export type DisplayEvent =
  | { type: 'waiting'; code: string; expiresAt: string }
  | { type: 'paired' }
  | { type: 'state'; envelope: DisplayEnvelope }
  | { type: 'unpaired' }
  | { type: 'expired' }
  /** Sent while nothing else is, so a quiet connection is told apart from a dead one. */
  | { type: 'ping' }

/** Pushes events to the screens that are listening. Nothing is kept: a screen that is not listening misses them. */
export interface IDisplayStream {
  publish(sessionId: string, event: DisplayEvent): void
  /** Calls `listener` with every event published for the session; returns the function that stops it. */
  subscribe(sessionId: string, listener: (event: DisplayEvent) => void): () => void
}

const displayStreamTokenSymbol: unique symbol = Symbol('IDisplayStream')
export const displayStreamToken = displayStreamTokenSymbol.toString()
