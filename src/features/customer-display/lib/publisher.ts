import type { DisplayChannel } from './channel'
import { ENVELOPE_VERSION, HEARTBEAT_MS, parseMessage, type DisplayView } from './display-state'

/** Calls `run` every `everyMs` until the returned function is called. Injected so tests fire it by hand. */
export type Scheduler = (run: () => void, everyMs: number) => () => void

const everyInterval: Scheduler = (run, everyMs) => {
  const id = setInterval(run, everyMs)
  return () => clearInterval(id)
}

export interface PublisherOptions {
  channel: DisplayChannel
  /** Names this till window; a reload makes a new one. */
  sessionId: string
  now?: () => number
  schedule?: Scheduler
}

/** The till's side: remembers what is on the counter and keeps every customer screen up to date with it. */
export class DisplayPublisher {
  private seq = 0
  private latest: DisplayView | null = null
  private stopListening: (() => void) | null = null
  private stopHeartbeat: (() => void) | null = null

  constructor(private readonly options: PublisherOptions) {}

  start() {
    const { channel, schedule = everyInterval } = this.options
    // A screen that opens (or reloads) asks, and gets the latest state at once.
    this.stopListening = channel.subscribe((raw) => {
      if (parseMessage(raw)?.type === 'hello') this.send()
    })
    // Repeating the state lets a screen notice that the till has gone quiet.
    this.stopHeartbeat = schedule(() => this.send(), HEARTBEAT_MS)
  }

  update(view: DisplayView) {
    this.latest = view
    this.send()
  }

  /** Sends the latest state again, for a channel that has just become useful (a screen was paired). */
  resend() {
    this.send()
  }

  /** The till is closing or reloading: do not leave its last basket in front of the next customer. */
  leave() {
    if (this.latest === null) return
    this.latest = { ...this.latest, state: { kind: 'idle' } }
    this.send()
  }

  stop() {
    this.stopListening?.()
    this.stopHeartbeat?.()
    this.stopListening = null
    this.stopHeartbeat = null
  }

  private send() {
    if (this.latest === null) return
    const { channel, sessionId, now = Date.now } = this.options
    this.seq += 1
    channel.post({
      type: 'state',
      envelope: { v: ENVELOPE_VERSION, sessionId, seq: this.seq, at: now(), ...this.latest },
    })
  }
}
