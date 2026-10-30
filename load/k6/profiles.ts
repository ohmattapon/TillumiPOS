// The k6 options of a run: which scenarios run, how hard (mix.ts), and the thresholds that pass or fail it.
import { parseKnobs, scenariosFor, tillsFor, type Knobs } from './lib/mix.ts'
import { composeThresholds, type Threshold } from './lib/thresholds.ts'
import type { ScenarioShape } from './lib/shape.ts'
import { options as catalogOptions } from './scenarios/catalog.ts'
import { options as authOptions } from './scenarios/auth.ts'
import { options as checkoutOptions } from './scenarios/checkout.ts'
import { options as contentionOptions } from './scenarios/contention.ts'
import { options as displayOptions } from './scenarios/display.ts'
import { options as membersOptions } from './scenarios/members.ts'
import { options as ordersOptions } from './scenarios/orders.ts'
import { options as qrOptions } from './scenarios/qr.ts'
import { options as reportsOptions } from './scenarios/reports.ts'
import { options as stockOptions } from './scenarios/stock.ts'

interface ProfileOptions {
  scenarios: Record<string, ScenarioShape>
  thresholds: Record<string, Threshold[]>
  /**
   * The system tags k6 puts on every metric sample, without `url`: the customer display's stream URL holds the
   * display's token, and a token must not reach a metrics output. Every request has a `name` tag instead.
   */
  systemTags: string[]
}

const SYSTEM_TAGS = ['proto', 'status', 'method', 'name', 'group', 'check', 'error', 'error_code', 'tls_version', 'scenario', 'service', 'expected_response']

interface ScenarioDefinition {
  thresholds: Record<string, string[]>
  /** Scenarios that run beside the main one in every profile (exec is the exported function name). */
  extra?: Record<string, ScenarioShape>
  /** Set when the run is made of parts with their own executors and setup (contention); the same in every profile. */
  scenarios?: Record<string, ScenarioShape>
}

const SCENARIOS: Record<string, ScenarioDefinition> = {
  catalog: catalogOptions,
  checkout: checkoutOptions,
  orders: ordersOptions,
  qr: qrOptions,
  // Logs in only as the lockprobe users; `authLock` is the one-off PIN lock test and must run once per run, because
  // the lock lasts 15 minutes in the API's memory.
  auth: { ...authOptions, extra: { auth_lock: { executor: 'per-vu-iterations', exec: 'authLock', vus: 1, iterations: 1, maxDuration: '1m' } } },
  display: displayOptions,
  // The owner's and the cashiers' reads and writes outside a sale: none of these opens a shift.
  reports: reportsOptions,
  members: membersOptions,
  stock: stockOptions,
  // Correctness under concurrent access, run on its own (never in the shop-day mix). Its parts sell on registers 1..7
  // (CONTENTION_PLAN) and setupContention opens their shifts; with nothing else selling in the run, no other scenario
  // wants those registers.
  contention: contentionOptions,
}

/** k6 options for a profile and scenario (shop-day or one part of it). `env` holds LOAD_SCALE, LOAD_DURATION_SCALE and LOAD_BASELINE. */
export function profileOptions(profile: string, scenario: string, env: Record<string, string | undefined>): ProfileOptions {
  const knobs: Knobs = parseKnobs(env)
  const contention = SCENARIOS.contention!
  const scenarios = scenario === 'contention' ? contention.scenarios! : { ...scenariosFor(profile, scenario, knobs), ...SCENARIOS[scenario]?.extra }
  const own = scenario === 'contention' ? [contention.thresholds] : Object.keys(scenarios).filter((name) => SCENARIOS[name]).map((name) => SCENARIOS[name]!.thresholds)
  const sells = scenario === 'contention' || tillsFor(profile, scenario).length > 0
  const thresholds = composeThresholds({ profile, knobs, sells, own, scenarioNames: Object.keys(scenarios) })
  return { scenarios, thresholds, systemTags: SYSTEM_TAGS }
}
