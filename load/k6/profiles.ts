// The load shape of each profile: which scenarios run, how many virtual users and for how long.
import { options as catalogOptions } from './scenarios/catalog.ts'
import { options as authOptions } from './scenarios/auth.ts'
import { options as checkoutOptions } from './scenarios/checkout.ts'
import { options as displayOptions } from './scenarios/display.ts'
import { options as ordersOptions } from './scenarios/orders.ts'
import { options as qrOptions } from './scenarios/qr.ts'

interface Stage {
  duration: string
  target: number
}

type ScenarioShape =
  | { executor: 'constant-vus'; exec: string; vus: number; duration: string }
  | { executor: 'per-vu-iterations'; exec: string; vus: number; iterations: number; maxDuration: string }
  | { executor: 'ramping-vus'; exec: string; startVUs: number; stages: Stage[]; gracefulRampDown: string }

interface ProfileOptions {
  scenarios: Record<string, ScenarioShape>
  thresholds: Record<string, string[]>
  /**
   * The system tags k6 puts on every metric sample, without `url`: the customer display's stream URL holds the
   * display's token, and a token must not reach a metrics output. Every request has a `name` tag instead.
   */
  systemTags: string[]
}

const SYSTEM_TAGS = ['proto', 'status', 'method', 'name', 'group', 'check', 'error', 'error_code', 'tls_version', 'scenario', 'service', 'expected_response']

interface ScenarioDefinition {
  thresholds: Record<string, string[]>
  /** Set for a scenario that sells: the most virtual users it may run, one per register (see load/k6/lib/shifts.ts). */
  tills?: number
  /**
   * Which end of the register list the tills are taken from. Scenarios that sell cash use the start (the default) and
   * the QR scenario uses the end, so when the shop-day mix runs them together (cash tills + QR tills <= 10) no register
   * is wanted twice.
   */
  registers?: 'start' | 'end'
  /** Scenarios that run beside the main one in every profile (exec is the exported function name). */
  extra?: Record<string, ScenarioShape>
}

const COMMON_THRESHOLDS = { expected_failed: ['rate<0.01'] }

/** A selling scenario must leave no shift open at the end. */
const SHIFT_THRESHOLDS = { shift_close_failed: ['count==0'] }

/** Every register holds one open shift, and the seed has 10 registers, so a selling scenario never runs more than 10 users. */
export const TILLS = 10
export const QR_TILLS = 3

const SCENARIOS: Record<string, ScenarioDefinition> = {
  catalog: catalogOptions,
  checkout: { ...checkoutOptions, tills: TILLS },
  orders: { ...ordersOptions, tills: TILLS },
  // QR is a minority of a shop's payments, so it gets 3 of the 10 registers (the last 3).
  qr: { ...qrOptions, tills: QR_TILLS, registers: 'end' },
  // Logs in only as the lockprobe users; `authLock` is the one-off PIN lock test and must run once per run, because
  // the lock lasts 15 minutes in the API's memory.
  auth: { ...authOptions, extra: { auth_lock: { executor: 'per-vu-iterations', exec: 'authLock', vus: 1, iterations: 1, maxDuration: '1m' } } },
  display: displayOptions,
}

/** Ramp up to the tills, hold, ramp down. */
const LOAD_STAGES: Stage[] = [
  { duration: '30s', target: TILLS },
  { duration: '2m', target: TILLS },
  { duration: '30s', target: 0 },
]

/** How many virtual users run the scenario in the profile; a scenario that sells opens one shift for each of them. */
export function virtualUsers(profile: string, scenario: string): number {
  const definition = SCENARIOS[scenario]
  if (!definition) throw new Error(`Unknown scenario "${scenario}"`)
  if (profile === 'smoke') return 1
  if (profile === 'load' && definition.tills) return definition.tills
  throw new Error(`The "${profile}" profile has no ${scenario} mix yet`)
}

/** Which end of the register list the scenario's tills come from. */
export function registersFrom(scenario: string): 'start' | 'end' {
  return SCENARIOS[scenario]?.registers ?? 'start'
}

/** Scenarios that sell need a shift for each virtual user (opened in setup, closed in teardown). */
export function needsShifts(scenario: string): boolean {
  return SCENARIOS[scenario]?.tills !== undefined
}

/** k6 options for a profile and the scenario the runner asked for. Smoke runs one user; load ramps the selling scenarios to 10 tills. */
export function profileOptions(profile: string, scenario: string): ProfileOptions {
  const definition = SCENARIOS[scenario]
  if (!definition) throw new Error(`Unknown scenario "${scenario}"`)
  const users = virtualUsers(profile, scenario)
  const shape: ScenarioShape =
    profile === 'load'
      ? { executor: 'ramping-vus', exec: scenario, startVUs: 0, stages: LOAD_STAGES, gracefulRampDown: '30s' }
      : { executor: 'constant-vus', exec: scenario, vus: users, duration: '1m' }
  return {
    scenarios: { [scenario]: shape, ...definition.extra },
    thresholds: { ...COMMON_THRESHOLDS, ...(definition.tills ? SHIFT_THRESHOLDS : {}), ...definition.thresholds },
    systemTags: SYSTEM_TAGS,
  }
}
