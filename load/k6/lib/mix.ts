// Which scenarios a run is made of, how hard each one pushes, and which registers the selling ones work. Pure and
// free of k6 imports, so Bun tests it (mix.test.ts) and the runner checks a profile/scenario pair with it before it
// creates a database.
//
// Registers: the seed has 10 and a register holds one open shift, so the selling scenarios share them without overlap
// (TILL_ALLOTMENT). Setup opens one shift per allotted register, slot i of scenario S on register offset(S) + i, and
// every VU of S claims a slot from the runner (load/lib/slot-claims.ts) on its first iteration. An arrival-rate
// executor never gets more VUs than its scenario has registers: when the system is slower than the arrival rate, k6
// reports dropped_iterations, which is the honest signal (a till cannot serve two customers at once).
import { MEMBER_SLICES } from './member-slices.ts'
import type { ScenarioShape, Stage } from './shape.ts'

export const PROFILES = ['smoke', 'load', 'stress', 'spike', 'soak'] as const
export const SHOP_DAY = 'shop-day'
export const REGISTERS = 10

export const SELLING = ['checkout', 'orders', 'qr'] as const
export type Selling = (typeof SELLING)[number]

/** The parts of the shop-day mix; each can also run alone in any profile but smoke runs them one by one. */
export const COMPONENTS = ['checkout', 'orders', 'qr', 'members', 'reports', 'stock', 'display'] as const
type Component = (typeof COMPONENTS)[number]

/** Scenarios that only make sense in the smoke profile: they are not part of a shop's day. */
const SMOKE_ONLY = ['catalog', 'auth']
/** Every scenario a smoke run can take. Contention has the same fixed shape in every profile. */
const SCENARIOS = [...SMOKE_ONLY, ...COMPONENTS, 'contention']

/** Register offset and count of each selling scenario: 10 registers, cash sales on most, open orders and QR on fewer. */
export const TILL_ALLOTMENT: Record<Selling, { offset: number; count: number }> = {
  checkout: { offset: 0, count: 5 },
  orders: { offset: 5, count: 3 },
  qr: { offset: 8, count: 2 },
}

// The controller's starting assumptions for a 10-register shop at the lunch peak (the spec), adjustable after the
// first runs. Per virtual user (= per register for the selling ones), in iterations an hour.
//  - checkout: 2 sales a minute on each cash till
//  - orders: 1 pass a minute (one pass opens, edits, splits, merges and pays two bills)
//  - qr: 1 PromptPay sale a minute (a pass waits a few seconds for the bank)
//  - members: 2 lookups a minute on each of MEMBER_VUS counters
const PEAK_PER_HOUR: Record<Selling | 'members', number> = { checkout: 120, orders: 60, qr: 60, members: 120 }
/** Parts that run at a steady low rate all day: the owner opens the reports every 2 minutes, goods arrive every 5. */
const STEADY_PER_HOUR = { reports: 30, stock: 12 }
const MEMBER_VUS = 2
const DISPLAY_VUS = 2

/** A day as levels of the lunch peak (1 = peak), each reached at the end of its stage. */
interface DayPlan {
  start: number
  stages: { seconds: number; level: number }[]
}

const STRESS_STEPS = [1, 2, 4, 6, 8, 10, 15, 20]

const PLANS: Record<Exclude<(typeof PROFILES)[number], 'smoke'>, DayPlan> = {
  // 10 minutes: the morning ramp, the lunch peak, a quieter afternoon.
  load: {
    start: 0.2,
    stages: [
      { seconds: 60, level: 0.5 },
      { seconds: 120, level: 0.5 },
      { seconds: 60, level: 1 },
      { seconds: 180, level: 1 },
      { seconds: 60, level: 0.6 },
      { seconds: 120, level: 0.6 },
    ],
  },
  // 45 minutes at a moderate level, to show slow leaks and latency that drifts.
  soak: { start: 0.2, stages: [{ seconds: 120, level: 0.6 }, { seconds: 2520, level: 0.6 }, { seconds: 60, level: 0.6 }] },
  // A quiet shop, then ten times as many customers at once for a minute, then quiet again to watch the recovery.
  spike: {
    start: 0.3,
    stages: [
      { seconds: 60, level: 0.3 },
      { seconds: 10, level: 3 },
      { seconds: 60, level: 3 },
      { seconds: 10, level: 0.3 },
      { seconds: 120, level: 0.3 },
    ],
  },
  // Steps up from the peak until something breaks (the stress thresholds abort the run at 5% errors).
  stress: { start: 0.5, stages: STRESS_STEPS.flatMap((level) => [{ seconds: 30, level }, { seconds: 90, level }]) },
}

export interface Knobs {
  /** LOAD_SCALE: multiplies every arrival rate (0.2 on a laptop). */
  scale: number
  /**
   * LOAD_DURATION_SCALE: a time-lapse. Every stage's length is multiplied by it and every rate divided by it, so a
   * short run (0.15 makes load 90 s) still has the arrivals of the whole profile, only closer together.
   */
  durationScale: number
  /** LOAD_BASELINE=1: latency thresholds do not fail the run (a first run records the baseline). */
  baseline: boolean
}

export const DEFAULT_KNOBS: Knobs = { scale: 1, durationScale: 1, baseline: false }

function parseNumber(env: Record<string, string | undefined>, name: string, max: number): number {
  const raw = env[name]
  if (raw === undefined) return 1
  const value = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN
  if (!(value > 0 && value <= max)) throw new Error(`${name} must be a number above 0 and at most ${max}, for example 0.2`)
  return value
}

export function parseKnobs(env: Record<string, string | undefined>): Knobs {
  const baseline = env.LOAD_BASELINE
  if (baseline !== undefined && baseline !== '0' && baseline !== '1') throw new Error('LOAD_BASELINE must be 1 (latency does not fail the run) or 0')
  return { scale: parseNumber(env, 'LOAD_SCALE', 100), durationScale: parseNumber(env, 'LOAD_DURATION_SCALE', 10), baseline: baseline === '1' }
}

export function runnableScenarios(profile: string): string[] {
  return profile === 'smoke' ? [...SCENARIOS] : [SHOP_DAY, ...COMPONENTS, 'contention']
}

/** Refuses a profile/scenario pair that has no shape, before anything is started. */
export function validateRun(profile: string, scenario: string): void {
  if (!(PROFILES as readonly string[]).includes(profile)) throw new Error(`Unknown profile "${profile}"; use one of ${PROFILES.join(', ')}`)
  if (scenario !== SHOP_DAY && !SCENARIOS.includes(scenario)) throw new Error(`Unknown scenario "${scenario}"; use one of ${[SHOP_DAY, ...SCENARIOS].join(', ')}`)
  if (profile === 'smoke' && scenario === SHOP_DAY) throw new Error('shop-day is not a smoke scenario: run the load profile, shortened with LOAD_DURATION_SCALE (for example 0.15) and LOAD_SCALE')
  if (!runnableScenarios(profile).includes(scenario)) throw new Error(`${scenario} runs in the smoke profile only; the ${profile} profile takes shop-day, ${COMPONENTS.join(', ')} or contention`)
}

export function defaultScenario(profile: string): string {
  return profile === 'smoke' ? 'catalog' : SHOP_DAY
}

function componentsOf(profile: string, scenario: string): Component[] {
  validateRun(profile, scenario)
  if (scenario === SHOP_DAY) return [...COMPONENTS]
  return (COMPONENTS as readonly string[]).includes(scenario) ? [scenario as Component] : []
}

const isSelling = (name: string): name is Selling => (SELLING as readonly string[]).includes(name)

export interface Till {
  scenario: Selling
  /** The slot a VU of the scenario claims, from 0. */
  slot: number
  /** The register (index into the seed's registers) and the cashier (index into the users) of the till. */
  registerIndex: number
  userIndex: number
}

/** The shifts setup opens: slot i of scenario S on register offset(S) + i, worked by the cashier of the same index. */
export function tillsFor(profile: string, scenario: string): Till[] {
  return componentsOf(profile, scenario)
    .filter(isSelling)
    .flatMap((name) => {
      const { offset, count } = TILL_ALLOTMENT[name]
      return Array.from({ length: profile === 'smoke' ? 1 : count }, (_, slot) => ({ scenario: name, slot, registerIndex: offset + slot, userIndex: offset + slot }))
    })
}

/** How many slots the runner hands out per scenario: the tills of each selling one, and the member slices. */
export function claimCapacities(profile: string, scenario: string): Record<string, number> {
  const capacities: Record<string, number> = {}
  for (const till of tillsFor(profile, scenario)) capacities[till.scenario] = (capacities[till.scenario] ?? 0) + 1
  if (componentsOf(profile, scenario).includes('members')) capacities.members = MEMBER_SLICES
  return capacities
}

const seconds = (value: number): string => `${value}s`

function scaledStages(plan: DayPlan, knobs: Knobs) {
  return plan.stages.map((stage) => ({ seconds: Math.max(1, Math.round(stage.seconds * knobs.durationScale)), level: stage.level }))
}

/** A ramping arrival rate over the day for `vus` virtual users, each at `perHour` at the peak. */
function dayRate(exec: string, plan: DayPlan, knobs: Knobs, perHour: number, vus: number): ScenarioShape {
  const rate = (level: number) => Math.round((perHour * vus * level * knobs.scale) / knobs.durationScale)
  const stages: Stage[] = scaledStages(plan, knobs).map((stage) => ({ duration: seconds(stage.seconds), target: rate(stage.level) }))
  return { executor: 'ramping-arrival-rate', exec, startRate: rate(plan.start), timeUnit: '1h', preAllocatedVUs: vus, maxVUs: vus, stages }
}

/** The k6 scenarios of a run, keyed by scenario name (the same as the function they run). */
export function scenariosFor(profile: string, scenario: string, knobs: Knobs): Record<string, ScenarioShape> {
  if (scenario === 'contention') throw new Error('contention has its own fixed scenarios')
  const components = componentsOf(profile, scenario)
  if (profile === 'smoke') return { [scenario]: { executor: 'constant-vus', exec: scenario, vus: 1, duration: '1m' } }
  const plan = PLANS[profile as keyof typeof PLANS]
  const total = seconds(scaledStages(plan, knobs).reduce((sum, stage) => sum + stage.seconds, 0))
  const shapes: Record<string, ScenarioShape> = {}
  for (const name of components) {
    if (isSelling(name)) shapes[name] = dayRate(name, plan, knobs, PEAK_PER_HOUR[name], TILL_ALLOTMENT[name].count)
    else if (name === 'members') shapes[name] = dayRate(name, plan, knobs, PEAK_PER_HOUR.members, MEMBER_VUS)
    // A constant rate starts its first iteration at once, so even a short run reads the reports and receives goods.
    else if (name === 'reports' || name === 'stock')
      shapes[name] = { executor: 'constant-arrival-rate', exec: name, rate: Math.max(1, Math.round((STEADY_PER_HOUR[name] * knobs.scale) / knobs.durationScale)), timeUnit: '1h', duration: total, preAllocatedVUs: 1, maxVUs: 1 }
    else shapes[name] = { executor: 'constant-vus', exec: name, vus: DISPLAY_VUS, duration: total }
  }
  return shapes
}

/** Baseline mode: every latency threshold still shows its row in the summary but cannot fail. */
export function relaxLatency<T>(thresholds: Record<string, T[]>): Record<string, T[] | string[]> {
  return Object.fromEntries(Object.entries(thresholds).map(([key, value]) => [key, key.startsWith('http_req_duration') ? ['max>=0'] : value]))
}
