// The load shape of each profile: which scenarios run, how many virtual users and for how long.
import { SELLING_TILLS, shapeOf, usersFor, type ScenarioShape } from './lib/shape.ts'
import { options as catalogOptions } from './scenarios/catalog.ts'
import { options as authOptions } from './scenarios/auth.ts'
import { options as checkoutOptions } from './scenarios/checkout.ts'
import { options as displayOptions } from './scenarios/display.ts'
import { options as membersOptions } from './scenarios/members.ts'
import { options as ordersOptions } from './scenarios/orders.ts'
import { options as qrOptions } from './scenarios/qr.ts'
import { options as reportsOptions } from './scenarios/reports.ts'
import { options as stockOptions } from './scenarios/stock.ts'

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

// A failed check fails the run: at most 1% of checks may fail anywhere. Scenarios whose few checks matter more add
// stricter thresholds of their own (rate==1 on a tag).
const COMMON_THRESHOLDS = { expected_failed: ['rate<0.01'], checks: ['rate>0.99'] }

/** A selling scenario must leave no shift open at the end. */
const SHIFT_THRESHOLDS = { shift_close_failed: ['count==0'] }

const SCENARIOS: Record<string, ScenarioDefinition> = {
  catalog: catalogOptions,
  checkout: { ...checkoutOptions, tills: SELLING_TILLS.checkout },
  orders: { ...ordersOptions, tills: SELLING_TILLS.orders },
  // QR is a minority of a shop's payments, so it gets 3 of the 10 registers (the last 3).
  qr: { ...qrOptions, tills: SELLING_TILLS.qr, registers: 'end' },
  // Logs in only as the lockprobe users; `authLock` is the one-off PIN lock test and must run once per run, because
  // the lock lasts 15 minutes in the API's memory.
  auth: { ...authOptions, extra: { auth_lock: { executor: 'per-vu-iterations', exec: 'authLock', vus: 1, iterations: 1, maxDuration: '1m' } } },
  display: displayOptions,
  // The owner's and the cashiers' reads and writes outside a sale: none of these opens a shift.
  reports: reportsOptions,
  members: membersOptions,
  stock: stockOptions,
}

/** How many virtual users run the scenario in the profile; a scenario that sells opens one shift for each of them. */
export function virtualUsers(profile: string, scenario: string): number {
  const definition = SCENARIOS[scenario]
  if (!definition) throw new Error(`Unknown scenario "${scenario}"`)
  return usersFor(profile, scenario, definition.tills)
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
  const shape = shapeOf(profile, scenario, users)
  return {
    scenarios: { [scenario]: shape, ...definition.extra },
    thresholds: { ...COMMON_THRESHOLDS, ...(definition.tills ? SHIFT_THRESHOLDS : {}), ...definition.thresholds },
    systemTags: SYSTEM_TAGS,
  }
}
