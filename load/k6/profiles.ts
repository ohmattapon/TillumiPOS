// The load shape of each profile: which scenarios run, how many virtual users and for how long.
import { options as catalogOptions } from './scenarios/catalog.ts'
import { options as checkoutOptions } from './scenarios/checkout.ts'
import { options as ordersOptions } from './scenarios/orders.ts'

interface Stage {
  duration: string
  target: number
}

type ScenarioShape =
  | { executor: 'constant-vus'; exec: string; vus: number; duration: string }
  | { executor: 'ramping-vus'; exec: string; startVUs: number; stages: Stage[]; gracefulRampDown: string }

interface ProfileOptions {
  scenarios: Record<string, ScenarioShape>
  thresholds: Record<string, string[]>
}

interface ScenarioDefinition {
  thresholds: Record<string, string[]>
  /** Set for a scenario that sells: the most virtual users it may run, one per register (see load/k6/lib/shifts.ts). */
  tills?: number
}

const COMMON_THRESHOLDS = { expected_failed: ['rate<0.01'] }

/** Every register holds one open shift, and the seed has 10 registers, so a selling scenario never runs more than 10 users. */
export const TILLS = 10

const SCENARIOS: Record<string, ScenarioDefinition> = {
  catalog: catalogOptions,
  checkout: { ...checkoutOptions, tills: TILLS },
  orders: { ...ordersOptions, tills: TILLS },
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
  return { scenarios: { [scenario]: shape }, thresholds: { ...COMMON_THRESHOLDS, ...definition.thresholds } }
}
