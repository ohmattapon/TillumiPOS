// The HTTP client every scenario uses: one session per user, requests tagged by name, and a count of the answers
// that were not the ones the scenario expected.
import http, { type CookieJar, type Response } from 'k6/http'
import { randomBytes } from 'k6/crypto'
import { Rate } from 'k6/metrics'
import { config } from './config.ts'

/** Add(true) for every answer whose status the call did not expect; threshold it to find real failures. */
export const expectedFailed = new Rate('expected_failed')

export interface Session {
  username: string
  /** Holds the login cookie; one jar per session so users never share a cookie. */
  jar: CookieJar
}

export interface CallOptions {
  /** Statuses the scenario accepts as right. Anything else counts in `expected_failed`. */
  expect: number[]
  /** The request's `name` tag, so every URL of one kind is one series (no ids in it). */
  name: string
  headers?: Record<string, string>
  /** Extra tags for the request's metrics (for example `range`), so a threshold can pick out one kind of call. */
  tags?: Record<string, string>
  /** `true` makes a fresh Idempotency-Key; a string uses that key (to repeat one on purpose). */
  idempotencyKey?: boolean | string
  /** How long k6 waits for the whole answer, for a request that is meant to be held open (an SSE stream). */
  timeout?: string | number
}

/** A random UUID v4, the shape the API requires. Scenarios that must repeat across runs use idempotencyKeyFor instead. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(randomBytes(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function send(session: Session, method: string, path: string, body: unknown, options: CallOptions): Response {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  const hasBody = body !== undefined && body !== null
  if (hasBody) headers['Content-Type'] = 'application/json'
  if (options.idempotencyKey) headers['Idempotency-Key'] = typeof options.idempotencyKey === 'string' ? options.idempotencyKey : newIdempotencyKey()
  const response = http.request(method, `${config().baseUrl}${path}`, hasBody ? JSON.stringify(body) : null, {
    headers,
    jar: session.jar,
    tags: { ...options.tags, name: options.name },
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    // Without this k6 counts every 4xx as http_req_failed, even the ones a scenario expects.
    responseCallback: http.expectedStatuses(...options.expect),
  })
  expectedFailed.add(!options.expect.includes(response.status), { name: options.name })
  return response
}

export function api(session: Session) {
  // get(path, options) and get(path, undefined, options) are the same call; post and patch take the body second.
  const get = (path: string, bodyOrOptions: unknown, maybeOptions?: CallOptions): Response =>
    send(session, 'GET', path, undefined, maybeOptions ?? (bodyOrOptions as CallOptions))
  return {
    get: get as {
      (path: string, options: CallOptions): Response
      (path: string, body: undefined, options: CallOptions): Response
    },
    post: (path: string, body: unknown, options: CallOptions) => send(session, 'POST', path, body, options),
    patch: (path: string, body: unknown, options: CallOptions) => send(session, 'PATCH', path, body, options),
    put: (path: string, body: unknown, options: CallOptions) => send(session, 'PUT', path, body, options),
  }
}

/** A session that has not logged in yet; `login` fills its jar. */
export function newSession(username: string): Session {
  return { username, jar: new http.CookieJar() }
}
