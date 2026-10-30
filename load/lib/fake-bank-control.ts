// How a load test plays the customer against the fake bank (server/test/kbank-server.ts). The fake lives in the
// runner process, so k6 cannot call its methods; this is a small HTTP control for it, in the spirit of
// server/test/kbank-dev-control.ts, and a front that sits between the API and the fake so one bank call can be slow.
//
//   POST /pay/:reference            the customer pays that QR
//   POST /cancel/:reference         the shop's cancel reached the bank (the bank reports the QR cancelled)
//   POST /latency/:ms               the next bank call waits at least that long (0 to 30000 ms)
//   POST /lose-next-create/:made    the next QR creation reaches the bank but its answer is lost (made = true|false)
//
// It listens on 127.0.0.1 only and refuses any request whose Host is not this machine, so a web page in a browser
// cannot reach it through DNS rebinding. It has no credentials to protect: it can only make the fake bank behave.
import type { Server } from 'bun'
import type { FakeKbank } from '../../server/test/kbank-server'

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])
export const MAX_LATENCY_MS = 30_000

function hostIsLocal(request: Request): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  try {
    return LOCAL_HOSTNAMES.has(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}

export interface FakeBankFront {
  /** Where the API's KBANK_API_BASE_URL should point instead of the fake itself. */
  url: string
  server: Server<unknown>
  /** The next request through the front waits this long before it is passed on. */
  delayNext(ms: number): void
}

/** A pass-through to the fake bank that can hold back the next request. It listens on 127.0.0.1 only. */
export function startFakeBankFront(fake: FakeKbank): FakeBankFront {
  let pendingDelayMs = 0
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const delay = pendingDelayMs
      pendingDelayMs = 0
      if (delay > 0) await Bun.sleep(delay)
      const { pathname, search } = new URL(request.url)
      const passed = await fetch(`${fake.url}${pathname}${search}`, {
        method: request.method,
        headers: request.headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
      })
      // Bun decodes the body already, so the encoding headers of the original answer no longer describe it.
      const headers = new Headers(passed.headers)
      headers.delete('content-encoding')
      headers.delete('content-length')
      return new Response(await passed.arrayBuffer(), { status: passed.status, headers })
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, server, delayNext: (ms) => void (pendingDelayMs = ms) }
}

export function startFakeBankControl(fake: FakeKbank, port: number, front?: Pick<FakeBankFront, 'delayNext'>): Server<unknown> {
  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    fetch(request) {
      if (!hostIsLocal(request)) return new Response('forbidden host', { status: 403 })
      const { pathname } = new URL(request.url)
      const [, action, ...rest] = pathname.split('/')
      const argument = decodeURIComponent(rest.join('/'))
      if (!['pay', 'cancel', 'latency', 'lose-next-create'].includes(action ?? '') || argument === '') return new Response('not found', { status: 404 })
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: { allow: 'POST' } })

      if (action === 'pay' || action === 'cancel') {
        if (!fake.created.has(argument)) return new Response('unknown QR', { status: 404 })
        if (action === 'pay') fake.pay(argument)
        else fake.cancel(argument)
        return new Response('ok')
      }

      if (action === 'latency') {
        if (!/^\d{1,5}$/.test(argument) || Number(argument) > MAX_LATENCY_MS) return new Response(`latency must be a whole number of milliseconds from 0 to ${MAX_LATENCY_MS}`, { status: 400 })
        if (!front) return new Response('this control has no front to slow down', { status: 501 })
        front.delayNext(Number(argument))
        return new Response('ok')
      }

      if (argument !== 'true' && argument !== 'false') return new Response('made must be true or false', { status: 400 })
      fake.loseNextCreateAnswer(argument === 'true')
      return new Response('ok')
    },
  })
}
