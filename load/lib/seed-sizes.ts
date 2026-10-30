// Seed sizes from LOAD_SEED_<NAME> (for example LOAD_SEED_PAST_SALES=5000); unset ones keep the seed's default.
// Read before the database is made, so a typo costs nothing.
import { SEED_DEFAULTS, type SeedOptions } from '../seed'

/** The selling scenarios work 10 registers (mix.ts REGISTERS) and sign in as cashiers. */
const MIN_TILLS = 10

const envName = (key: string) => `LOAD_SEED_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`

export function parseSeedSizes(env: Record<string, string | undefined>): SeedOptions {
  const keys = Object.keys(SEED_DEFAULTS) as (keyof typeof SEED_DEFAULTS)[]
  const known = new Set(keys.map(envName))
  for (const name of Object.keys(env))
    if (name.startsWith('LOAD_SEED_') && !known.has(name)) throw new Error(`${name} is not a seed size; use one of ${[...known].join(', ')}`)
  const sizes: SeedOptions = {}
  for (const key of keys) {
    const raw = env[envName(key)]
    if (raw === undefined) continue
    if (!/^\d+$/.test(raw)) throw new Error(`${envName(key)} must be a whole number`)
    sizes[key] = Number(raw)
  }
  if (sizes.registers !== undefined && sizes.registers < MIN_TILLS) throw new Error(`The load profiles need at least ${MIN_TILLS} registers (LOAD_SEED_REGISTERS)`)
  if (sizes.cashiers !== undefined && sizes.cashiers < MIN_TILLS) throw new Error(`The load profiles need at least ${MIN_TILLS} cashiers (LOAD_SEED_CASHIERS)`)
  return sizes
}
