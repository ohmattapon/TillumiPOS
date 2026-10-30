// Sign-in, the session check and the quick staff switch, plus the PIN lock. This is the only scenario that may use
// the `lockprobe` users (`authUsers` in the seed): the cashier pool is never touched here, and no other scenario
// touches these users, because the PIN lock below deliberately locks one of them (auth.test.ts keeps both true).
//
//  - `auth` (many iterations): a user signs in, `/auth/me`, the staff list, and a PIN switch to another probe user.
//  - `authLock` (exactly one iteration per run): five wrong PINs against ONE probe user, then the lock. The API keeps
//    the lock in memory for 15 minutes, so a second run of this test against the same API would see PIN_LOCKED at
//    once; the runner starts a fresh API every run, and the profile runs this on one user for one iteration.
import { check, sleep } from 'k6'
import { login } from '../lib/auth.ts'
import { api, type Session } from '../lib/client.ts'
import { config } from '../lib/config.ts'

export const options = {
  thresholds: {
    'http_req_duration{name:auth.login}': ['p(95)<800'],
    'http_req_duration{name:auth.me}': ['p(95)<300'],
    'http_req_duration{name:auth.switch}': ['p(95)<800'],
  },
}

/** The ids of the probe users, found by signing in as each once (the staff list shows display names, not user names). */
const knownIds = new Map<string, number>()

/** The PIN every seeded user shares; it comes from the environment and is never printed. */
function sharedPin(): string {
  const pin = __ENV.USER_PIN
  if (!pin) throw new Error('USER_PIN is not set; run this through bun load/run.ts')
  return pin
}

/** The probe users: [0] is the one whose PIN gets locked, the rest are for the sign-in and switch traffic. */
function probes() {
  const { seed } = config()
  if (seed.authUsers.length < 3) throw new Error('The auth scenario needs at least three lockprobe users')
  return { lockTarget: seed.authUsers[0]!, others: seed.authUsers.slice(1) }
}

function signIn(username: string): Session {
  return login({ username, password: config().users[0]!.password })
}

function idOf(username: string): number | undefined {
  if (!knownIds.has(username)) {
    const me = api(signIn(username)).get('/api/v1/auth/me', { expect: [200], name: 'auth.me' })
    if (me.status === 200) knownIds.set(username, me.json('id') as number)
  }
  return knownIds.get(username)
}

/** Checks the user is offered in the staff list (it lists users who have a PIN) and returns the user id to switch to. */
function offeredId(session: Session, username: string): number | undefined {
  const id = idOf(username)
  const listed = api(session).get('/api/v1/auth/switch-users', { expect: [200], name: 'auth.switch-users' })
  const offered = listed.status === 200 && (listed.json('items') as { id: number }[]).some((member) => member.id === id)
  return offered ? id : undefined
}

/** Sign in, check the session, switch to another probe user with the right PIN, and check the switch took. */
export function auth() {
  const { others } = probes()
  const username = others[(__VU - 1 + __ITER) % others.length]!
  const target = others[(__VU + __ITER) % others.length]!
  const session = signIn(username)
  const client = api(session)

  const me = client.get('/api/v1/auth/me', { expect: [200], name: 'auth.me' })
  check(me, { 'me is the user who signed in': (res) => res.status === 200 && res.json('username') === username })

  const targetId = offeredId(session, target)
  if (check(targetId, { 'the staff list offers the switch target': (id) => id !== undefined })) {
    const switched = client.post('/api/v1/auth/switch', { userId: targetId, pin: sharedPin() }, { expect: [200], name: 'auth.switch' })
    check(switched, { 'switch answers with the target user': (res) => res.status === 200 && res.json('username') === target })
    const after = client.get('/api/v1/auth/me', { expect: [200], name: 'auth.me' })
    check(after, { 'the session now belongs to the target user': (res) => res.status === 200 && res.json('username') === target })
  }
  sleep(1)
}

/** Wrong PINs that differ from the real one, five of them. */
function wrongPins(): string[] {
  const real = sharedPin()
  return ['111111', '222222', '333333', '444444', '555555', '666666'].filter((pin) => pin !== real).slice(0, 5)
}

/** Five wrong PINs are 400 PIN_INVALID, and from then on the user is locked: 409 PIN_LOCKED, even for the right PIN. */
export function authLock() {
  const { lockTarget, others } = probes()
  const session = signIn(others[0]!)
  const client = api(session)
  const lockedId = offeredId(session, lockTarget)
  if (!check(lockedId, { 'the staff list offers the user to lock': (id) => id !== undefined })) return

  const invalid = wrongPins().map((pin) => client.post('/api/v1/auth/switch', { userId: lockedId!, pin }, { expect: [400], name: 'auth.switch-wrong-pin' }))
  check(invalid, {
    'five wrong PINs are each 400 PIN_INVALID': (responses) => responses.length === 5 && responses.every((res) => res.status === 400 && res.json('code') === 'PIN_INVALID'),
  })

  const refused = client.post('/api/v1/auth/switch', { userId: lockedId!, pin: wrongPins()[0]! }, { expect: [409], name: 'auth.switch-locked' })
  check(refused, { 'the next wrong PIN is 409 PIN_LOCKED': (res) => res.status === 409 && res.json('code') === 'PIN_LOCKED' })
  const rightPin = client.post('/api/v1/auth/switch', { userId: lockedId!, pin: sharedPin() }, { expect: [409], name: 'auth.switch-locked' })
  check(rightPin, { 'even the right PIN is refused while locked': (res) => res.status === 409 && res.json('code') === 'PIN_LOCKED' })
}
