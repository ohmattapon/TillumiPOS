// What the runner hands to k6. BASE_URL, SCENARIO and PROFILE come on the command line; the ids and the logins come
// through the process environment (SEED_JSON, USERS_JSON), so no password is on a command line or in a file.
import type { SeededData } from '../../seed.ts'
import { assertLocalBaseUrl } from './local-url.ts'

export interface LoadUser {
  username: string
  password: string
}

export interface Config {
  baseUrl: string
  scenario: string
  profile: string
  users: LoadUser[]
  /** The shop owner, only when the runner passed OWNER_JSON, for what a cashier may not do (reports, stock receipts, point adjustments); not one of `users`, so it never works a till. */
  owner?: LoadUser
  /** The day the seeded history ends before (the runner's REFERENCE_DATE); the scenarios that read dates count back from it. */
  referenceDate: Date
  seed: SeededData
}

let cached: Config | undefined

function requiredEnv(name: string): string {
  const value = __ENV[name]
  if (!value) throw new Error(`${name} is not set; run this through bun load/run.ts`)
  return value
}

function parseJson<T>(name: string): T {
  try {
    return JSON.parse(requiredEnv(name)) as T
  } catch {
    // The value may hold passwords, so it is never part of the message.
    throw new Error(`${name} is not valid JSON`)
  }
}

export function config(): Config {
  if (cached) return cached
  const baseUrl = requiredEnv('BASE_URL').replace(/\/+$/, '')
  assertLocalBaseUrl(baseUrl)
  const users = parseJson<LoadUser[]>('USERS_JSON')
  if (!Array.isArray(users) || users.length === 0) throw new Error('USERS_JSON must hold at least one user')
  const owner = __ENV.OWNER_JSON ? parseJson<LoadUser>('OWNER_JSON') : undefined
  if (owner && (!owner.username || !owner.password)) throw new Error('OWNER_JSON must hold a username and a password')
  // Unset only when k6 is started by hand; the runner always sets it from the date it seeded with.
  const referenceDate = __ENV.REFERENCE_DATE ? new Date(__ENV.REFERENCE_DATE) : new Date()
  if (Number.isNaN(referenceDate.getTime())) throw new Error('REFERENCE_DATE is not a date')
  cached = { baseUrl, scenario: requiredEnv('SCENARIO'), profile: requiredEnv('PROFILE'), users, owner, referenceDate, seed: parseJson<SeededData>('SEED_JSON') }
  return cached
}
