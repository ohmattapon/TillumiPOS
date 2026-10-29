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
  cached = { baseUrl, scenario: requiredEnv('SCENARIO'), profile: requiredEnv('PROFILE'), users, seed: parseJson<SeededData>('SEED_JSON') }
  return cached
}
