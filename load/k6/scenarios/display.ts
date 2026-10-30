// The customer display through the server: a screen asks for a session (no sign-in), a cashier types its 6-digit
// code, the till publishes a sale state, and the screen holds its SSE stream open.
//
// How the stream is held: k6's http module has no streaming reader, and the SSE extension is not part of k6 v2.3.0.
// So the screen makes one long GET with a fixed timeout (HOLD_MS). The API keeps that connection open and sends events
// as they happen; when the timeout ends k6 drops the connection (which the API sees as a disconnect, like a screen
// that is switched off) and still hands over the bytes received so far. Those bytes are counted, and the events in
// them are checked. A timeout is therefore the expected end of this request, and is not an error.
//
// The token of a session is the key to its stream, so it is only ever held in a variable: it is not logged, not in a
// check name, and the metrics carry the request's `name` tag instead of its URL (see systemTags in profiles.ts).
import { check, sleep } from 'k6'
import http from 'k6/http'
import { Counter } from 'k6/metrics'
import { login } from '../lib/auth.ts'
import { api, newSession, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'

/** How long a screen keeps its stream open. */
const HOLD_MS = 4000

/** Bytes of SSE the screens received, and how many streams ended without the events they should have had. */
export const displayStreamBytes = new Counter('display_stream_bytes')
export const displayStreamIncomplete = new Counter('display_stream_incomplete')

export const options = {
  thresholds: {
    'http_req_duration{name:display.session}': ['p(95)<300'],
    'http_req_duration{name:display.pair}': ['p(95)<300'],
    'http_req_duration{name:display.publish}': ['p(95)<300'],
    display_stream_incomplete: ['count==0'],
  },
}

let cashier: Session | undefined

/** The state a till publishes: one line on the counter. The shape is the envelope the screen reads (display-schemas.ts). */
function sellingEnvelope(sessionId: string, seq: number) {
  return {
    v: 1,
    sessionId,
    seq,
    at: Date.now(),
    locale: 'th',
    currency: 'THB',
    shopName: 'load',
    state: { kind: 'selling', lines: [{ name: 'load item', options: [], quantity: 1, lineTotalSatang: 1000 }], subtotalSatang: 1000, discountSatang: 0, vatSatang: 0, vatMode: 'none', totalSatang: 1000 },
  }
}

export function display() {
  const { users } = config()
  cashier ??= login(users[(__VU - 1) % users.length]!)

  // 1. The screen asks for a session. It is not signed in, so it has a session of its own, with no cookie.
  const screen = api(newSession('display-screen'))
  const started = screen.post('/api/v1/customer-display/sessions', undefined, { expect: [200], name: 'display.session' })
  const session = started.status === 200 ? (started.json() as { token: string; code: string }) : null
  if (!check(session, { 'screen gets a token and a 6-digit code': (s) => typeof s?.token === 'string' && /^\d{6}$/.test(s.code) })) {
    sleep(1)
    return
  }

  // 2. The cashier types the code; 3. the till publishes what is on the counter.
  const till = api(cashier)
  const paired = till.post('/api/v1/customer-display/pair', { code: session!.code }, { expect: [200], name: 'display.pair' })
  check(paired, { 'pairing binds at least one screen': (res) => res.status === 200 && res.json('displays') >= 1 })
  const published = till.put('/api/v1/customer-display/state', { envelope: sellingEnvelope(`load-${__VU}`, __ITER) }, { expect: [200], name: 'display.publish' })
  check(published, { 'state reaches the paired screen': (res) => res.status === 200 && res.json('displays') >= 1 })

  // 4. The screen opens its stream and holds it.
  const streamed = http.request('GET', `${config().baseUrl}/api/v1/customer-display/stream?token=${session!.token}`, null, {
    headers: { Accept: 'text/event-stream' },
    tags: { name: 'display.stream' },
    timeout: HOLD_MS,
    // Held until the timeout, so the end of this request is not a failure.
    responseCallback: http.expectedStatuses(200, 0),
  })
  const received = typeof streamed.body === 'string' ? streamed.body : ''
  displayStreamBytes.add(received.length)
  const complete = check(received, {
    'stream tells the screen it is paired': (text) => text.includes('event: paired'),
    'stream delivers the state the till published': (text) => text.includes('event: state') && text.includes('load item'),
  })
  if (!complete) displayStreamIncomplete.add(1)
  sleep(1)
}
