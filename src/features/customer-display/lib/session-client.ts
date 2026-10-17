/** Where a screen stands with the server. */
export type DisplayConnection =
  | { phase: 'connecting' }
  | { phase: 'waiting'; code: string; expiresAt: string }
  | { phase: 'paired' }

export interface StreamListeners {
  /** A named event of the stream, with its JSON data. */
  onEvent(name: string, data: unknown): void
  /** The stream ended for good: the server does not know this token (any more). */
  onClosed(): void
}

export interface StreamHandle {
  close(): void
}

export interface SessionClientOptions {
  /** Asks the server for a new screen session. */
  start: () => Promise<{ token: string; code: string; expiresAt: string | Date }>
  /** Opens the stream of a session. The browser's EventSource reconnects by itself after a dropped connection. */
  open: (token: string, listeners: StreamListeners) => StreamHandle
  /** Remembers the token, so a reloaded or restarted screen is still paired. */
  storage: { get(): string | null; set(token: string): void; clear(): void }
  /** Gets every sale message, in the shape the browser channel carries. */
  onMessage: (raw: unknown) => void
  onStatus: (status: DisplayConnection) => void
  retryMs?: number
  /** Calls `run` after `ms`; returns the function that cancels it. Injected so tests fire it by hand. */
  schedule?: (run: () => void, ms: number) => () => void
}

const inTime = (run: () => void, ms: number) => {
  const id = setTimeout(run, ms)
  return () => clearTimeout(id)
}

/**
 * The customer screen's side of the server: gets a code, shows it until a till takes it, then follows the till.
 * When the server forgets the screen (a restart, an unpair, a code that ran out) it asks for a new code by itself.
 */
export class DisplaySessionClient {
  private handle: StreamHandle | null = null
  private cancelRetry: (() => void) | null = null
  private stopped = false

  constructor(private readonly options: SessionClientOptions) {}

  start() {
    const token = this.options.storage.get()
    if (token) this.follow(token)
    else this.begin()
  }

  stop() {
    this.stopped = true
    this.handle?.close()
    this.handle = null
    this.cancelRetry?.()
    this.cancelRetry = null
  }

  private begin() {
    if (this.stopped) return
    const { start, storage, onStatus } = this.options
    onStatus({ phase: 'connecting' })
    start().then(
      (session) => {
        if (this.stopped) return
        storage.set(session.token)
        this.follow(session.token)
      },
      () => this.retry(),
    )
  }

  private follow(token: string) {
    if (this.stopped) return
    this.handle?.close()
    this.handle = this.options.open(token, {
      onEvent: (name, data) => this.hear(name, data),
      onClosed: () => this.forget(),
    })
  }

  private hear(name: string, data: unknown) {
    const { onMessage, onStatus } = this.options
    const fields = (data ?? {}) as Record<string, unknown>
    if (name === 'waiting') onStatus({ phase: 'waiting', code: String(fields.code), expiresAt: String(fields.expiresAt) })
    else if (name === 'paired') onStatus({ phase: 'paired' })
    else if (name === 'state') onMessage({ type: 'state', envelope: data })
    else if (name === 'unpaired' || name === 'expired') this.forget()
  }

  /** The server no longer knows this screen: drop the token and ask for a fresh code. */
  private forget() {
    this.handle?.close()
    this.handle = null
    this.options.storage.clear()
    this.begin()
  }

  private retry() {
    const { retryMs = 5_000, schedule = inTime } = this.options
    this.cancelRetry = schedule(() => this.begin(), retryMs)
  }
}

/** The browser's EventSource as a stream: its named events, and a close only when the server has refused it. */
export function openEventSourceStream(url: string, names: readonly string[]) {
  return (token: string, listeners: StreamListeners): StreamHandle => {
    const source = new EventSource(`${url}?token=${encodeURIComponent(token)}`)
    for (const name of names) {
      source.addEventListener(name, (event) => {
        let data: unknown = null
        try {
          data = JSON.parse((event as MessageEvent<string>).data)
        } catch {
          // A malformed event is ignored, like any other message that is not understood.
          return
        }
        listeners.onEvent(name, data)
      })
    }
    source.addEventListener('error', () => {
      // While it is only CONNECTING the browser retries on its own; CLOSED means the server said no.
      if (source.readyState === EventSource.CLOSED) listeners.onClosed()
    })
    return { close: () => source.close() }
  }
}
