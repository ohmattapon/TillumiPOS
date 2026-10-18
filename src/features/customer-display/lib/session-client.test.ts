import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { DisplaySessionClient, openEventSourceStream, type DisplayConnection, type StreamListeners } from './session-client'

const flush = () => Bun.sleep(0)

interface Harness {
  client: DisplaySessionClient
  statuses: DisplayConnection[]
  messages: unknown[]
  opened: { token: string; listeners: StreamListeners; closed: boolean }[]
  started: number
  stored: { token: string | null }
  failNextStart: { value: boolean }
  retries: (() => void)[]
}

function build(token: string | null = null): Harness {
  const h: Harness = {
    statuses: [], messages: [], opened: [], started: 0, stored: { token },
    failNextStart: { value: false }, retries: [],
    client: undefined as unknown as DisplaySessionClient,
  }
  h.client = new DisplaySessionClient({
    start: async () => {
      h.started++
      if (h.failNextStart.value) {
        h.failNextStart.value = false
        throw new Error('offline')
      }
      return { token: `token-${h.started}`, code: '482913', expiresAt: '2026-10-16T09:10:00Z' }
    },
    open: (opened, listeners) => {
      const stream = { token: opened, listeners, closed: false }
      h.opened.push(stream)
      return { close: () => void (stream.closed = true) }
    },
    storage: {
      get: () => h.stored.token,
      set: (value) => void (h.stored.token = value),
      clear: () => void (h.stored.token = null),
    },
    onMessage: (raw) => h.messages.push(raw),
    onStatus: (status) => h.statuses.push(status),
    schedule: (run) => {
      h.retries.push(run)
      return () => {}
    },
  })
  return h
}

let h: Harness
beforeEach(() => {
  h = build()
})

describe('DisplaySessionClient', () => {
  test('asks for a code, remembers the token and listens to the stream', async () => {
    h.client.start()
    await flush()

    expect(h.statuses[0]).toEqual({ phase: 'connecting' })
    expect(h.stored.token).toBe('token-1')
    expect(h.opened.map((s) => s.token)).toEqual(['token-1'])
  })

  test('shows the code the server says, then follows the till when paired', async () => {
    h.client.start()
    await flush()
    const { listeners } = h.opened[0]!

    listeners.onEvent('waiting', { code: '482913', expiresAt: '2026-10-16T09:10:00Z' })
    listeners.onEvent('paired', {})
    listeners.onEvent('state', { v: 1, seq: 4 })

    expect(h.statuses.at(-2)).toEqual({ phase: 'waiting', code: '482913', expiresAt: '2026-10-16T09:10:00Z' })
    expect(h.statuses.at(-1)).toEqual({ phase: 'paired' })
    expect(h.messages).toEqual([{ type: 'state', envelope: { v: 1, seq: 4 } }])
  })

  test('a screen that was paired before opens its old session instead of asking for a code', async () => {
    h = build('token-old')
    h.client.start()
    await flush()
    expect(h.started).toBe(0)
    expect(h.opened.map((s) => s.token)).toEqual(['token-old'])
  })

  test('asks for a new code when the till lets it go, or the code runs out', async () => {
    h.client.start()
    await flush()
    h.opened[0]!.listeners.onEvent('unpaired', {})
    await flush()
    expect(h.started).toBe(2)
    expect(h.opened[0]!.closed).toBe(true)
    expect(h.opened.at(-1)!.token).toBe('token-2')

    h.opened.at(-1)!.listeners.onEvent('expired', {})
    await flush()
    expect(h.started).toBe(3)
  })

  test('asks for a new code when the server no longer knows the stored token', async () => {
    h = build('token-forgotten')
    h.client.start()
    await flush()
    h.opened[0]!.listeners.onClosed()
    await flush()

    expect(h.stored.token).toBe('token-1')
    expect(h.started).toBe(1)
  })

  test('tries again later when the server cannot be reached', async () => {
    h.failNextStart.value = true
    h.client.start()
    await flush()
    expect(h.opened).toHaveLength(0)
    expect(h.retries).toHaveLength(1)

    h.retries[0]!()
    await flush()
    expect(h.opened.map((s) => s.token)).toEqual(['token-2'])
  })

  test('stops listening and asks for nothing after it is stopped', async () => {
    h.client.start()
    await flush()
    h.client.stop()
    h.opened[0]!.listeners.onEvent('unpaired', {})
    await flush()

    expect(h.opened[0]!.closed).toBe(true)
    expect(h.started).toBe(1)
  })
})

describe('with the browser timer', () => {
  test('a failed start is tried again after the retry delay, by a real timer', async () => {
    let starts = 0
    const opened: string[] = []
    const client = new DisplaySessionClient({
      start: async () => {
        starts += 1
        if (starts === 1) throw new Error('offline')
        return { token: 't', code: '123456', expiresAt: '2026-10-15T12:00:00Z' }
      },
      open: (token) => {
        opened.push(token)
        return { close: () => {} }
      },
      storage: { get: () => null, set: () => {}, clear: () => {} },
      onMessage: () => {},
      onStatus: () => {},
      retryMs: 5,
    })

    client.start()
    await Bun.sleep(60)
    client.stop()

    expect(starts).toBe(2)
    expect(opened).toEqual(['t'])
  })
})

describe('openEventSourceStream', () => {
  const nativeEventSource = (globalThis as { EventSource?: unknown }).EventSource

  class FakeEventSource {
    static CLOSED = 2
    static last: FakeEventSource
    readyState = 1
    closed = false
    handlers = new Map<string, ((event: unknown) => void)[]>()
    constructor(readonly url: string) { FakeEventSource.last = this }
    addEventListener(name: string, handler: (event: unknown) => void) {
      this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler])
    }
    close() { this.closed = true }
    emit(name: string, event: unknown = {}) { this.handlers.get(name)?.forEach((handler) => handler(event)) }
  }

  beforeEach(() => { (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource })
  afterEach(() => { (globalThis as { EventSource?: unknown }).EventSource = nativeEventSource })

  const open = () => {
    const events: [string, unknown][] = []
    let closedFor = 0
    const handle = openEventSourceStream('/api/v1/customer-display/stream', ['state', 'paired'])('a b', {
      onEvent: (name, data) => events.push([name, data]),
      onClosed: () => { closedFor += 1 },
    })
    return { handle, events, closed: () => closedFor }
  }

  test('opens the stream with the token in the query, escaped', () => {
    open()

    expect(FakeEventSource.last.url).toBe('/api/v1/customer-display/stream?token=a%20b')
  })

  test('hands every named event on as parsed JSON, and drops one that is not JSON', () => {
    const { events } = open()

    FakeEventSource.last.emit('state', { data: '{"seq":1}' })
    FakeEventSource.last.emit('paired', { data: 'not json' })

    expect(events).toEqual([['state', { seq: 1 }]])
  })

  test('an error while the browser is retrying is ignored, and a closed stream is reported', () => {
    const { closed } = open()

    FakeEventSource.last.readyState = 0
    FakeEventSource.last.emit('error')
    expect(closed()).toBe(0)

    FakeEventSource.last.readyState = FakeEventSource.CLOSED
    FakeEventSource.last.emit('error')
    expect(closed()).toBe(1)
  })

  test('closing the handle closes the stream', () => {
    const { handle } = open()

    handle.close()

    expect(FakeEventSource.last.closed).toBe(true)
  })
})
