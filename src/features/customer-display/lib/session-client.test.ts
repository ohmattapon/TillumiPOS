import { beforeEach, describe, expect, test } from 'bun:test'
import { DisplaySessionClient, type DisplayConnection, type StreamListeners } from './session-client'

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
