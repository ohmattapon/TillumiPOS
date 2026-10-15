import { isStale, parseMessage, pickNewer, type DisplayEnvelope } from './display-state'

/** The display's side: believes the newest valid message, and goes idle when the till falls silent. */
export class DisplayReceiver {
  private current: DisplayEnvelope | null = null
  private heardAt = 0
  private idleView: DisplayEnvelope | null = null

  constructor(private readonly now: () => number = Date.now) {}

  /** Takes one raw message from the wire. Returns true when what is shown may have changed. */
  receive(raw: unknown): boolean {
    const message = parseMessage(raw)
    if (message?.type !== 'state') return false
    const next = pickNewer(this.current, message.envelope)
    if (next === this.current) return false
    this.current = next
    this.idleView = null
    this.heardAt = this.now()
    return true
  }

  /** What to draw now: the last state, or an idle screen (same shop, nothing on it) once the till is quiet. */
  view(): DisplayEnvelope | null {
    if (this.current === null) return null
    if (!isStale(this.now(), this.heardAt)) return this.current
    // Memoised so a once-a-second refresh hands React the same object and nothing re-renders.
    this.idleView ??= { ...this.current, state: { kind: 'idle' } }
    return this.idleView
  }
}
