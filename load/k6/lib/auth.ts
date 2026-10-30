import { fail } from 'k6'
import { api, newSession, type Session } from './client.ts'
import { config, type LoadUser } from './config.ts'

/** Logs in once and keeps the cookie in the session; call it at the first iteration of a VU, not on every one. */
export function login(user: LoadUser): Session {
  const session = newSession(user.username)
  const response = api(session).post('/api/v1/auth/login', { username: user.username, password: user.password }, { expect: [200], name: 'auth.login' })
  if (response.status !== 200) fail(`login of ${user.username} answered ${response.status}`)
  return session
}

/** Signs in as the shop owner (see Config.owner). */
export function loginOwner(): Session {
  const { owner } = config()
  if (!owner) throw new Error('OWNER_JSON is not set; the runner sets it for the scenarios that need the owner')
  return login(owner)
}
