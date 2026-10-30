// The thresholds that pass or fail a run, put together from the parts of the run. Pure and free of k6 imports, so
// Bun tests it (thresholds.test.ts); profiles.ts hands it each scenario's own thresholds.
import { relaxLatency, type Knobs } from './mix.ts'

/** A threshold is an expression, or one that stops the run as soon as it is crossed. */
export type Threshold = string | { threshold: string; abortOnFail: boolean; delayAbortEval: string }

// A failed check fails the run: at most 1% of checks may fail anywhere. Scenarios whose few checks matter more add
// stricter thresholds of their own (rate==1 on a tag). A VU that found no free slot fails the run too.
export const COMMON_THRESHOLDS: Record<string, Threshold[]> = { expected_failed: ['rate<0.01'], checks: ['rate>0.99'], slot_claim_failed: ['count==0'] }

/** A selling scenario must leave no shift open at the end. */
export const SHIFT_THRESHOLDS: Record<string, Threshold[]> = { shift_close_failed: ['count==0'] }

/** How long stress lets the numbers settle before an abort may fire: a minute of the full-length profile. */
const ABORT_DELAY_SECONDS = 60

/**
 * Stress climbs until it breaks: at 5% failed requests or checks it stops at once. The delay is time-lapsed with the
 * run (LOAD_DURATION_SCALE), so a compressed stress run can still abort. k6 runs teardown after such an abort, so the
 * shifts are still closed.
 */
export function stressAbort(knobs: Knobs): Record<string, Threshold[]> {
  const delayAbortEval = `${Math.max(1, Math.round(ABORT_DELAY_SECONDS * knobs.durationScale))}s`
  return {
    expected_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval }],
    checks: [{ threshold: 'rate>0.95', abortOnFail: true, delayAbortEval }],
  }
}

function merge(...parts: Record<string, Threshold[]>[]): Record<string, Threshold[]> {
  const merged: Record<string, Threshold[]> = {}
  for (const part of parts) for (const [key, value] of Object.entries(part)) merged[key] = [...(merged[key] ?? []), ...value]
  return merged
}

export interface ThresholdParts {
  profile: string
  knobs: Knobs
  /** True when anything in the run opens shifts. */
  sells: boolean
  /** The thresholds of each scenario in the run. */
  own: Record<string, Threshold[]>[]
  /** The k6 scenario names, for an iterations row per scenario in the summary. */
  scenarioNames: string[]
}

export function composeThresholds({ profile, knobs, sells, own, scenarioNames }: ThresholdParts): Record<string, Threshold[]> {
  // Bookkeeping rows (count>=0 never fails): the summary then shows how much each part of a mixed run did.
  const perScenario = Object.fromEntries(scenarioNames.map((name) => [`iterations{scenario:${name}}`, ['count>=0']]))
  const thresholds = merge(COMMON_THRESHOLDS, sells ? SHIFT_THRESHOLDS : {}, ...own, perScenario, profile === 'stress' ? stressAbort(knobs) : {})
  // Baseline mode relaxes latency only; checks, error rates, counters and the stress aborts stay as they are.
  return knobs.baseline ? (relaxLatency(thresholds) as Record<string, Threshold[]>) : thresholds
}
