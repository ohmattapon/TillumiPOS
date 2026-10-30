// The result file of one load run. Schema version 1:
//
//   schemaVersion  1 (bump it when a field changes meaning or goes away; compare.ts refuses other versions)
//   startedAt      ISO time the run started (UTC)
//   profile, scenario
//   passed         false when k6 crossed a threshold, any invariant failed, or the invariants could not run
//   machine        { cpus, memoryGb, os, k6Version }
//   knobs          { scale, durationScale, baseline }: LOAD_SCALE, LOAD_DURATION_SCALE, LOAD_BASELINE
//   seed           the seed sizes used (counts only)
//   k6             { exitCode, metrics }: for every k6 metric its NUMERIC aggregates (count, rate, value, avg, min,
//                  med, max, p(90), p(95), p(99), passes, fails). Nothing else of the k6 summary is copied.
//   invariants     the post-run checks as InvariantResult[]
//   resources      { intervalMs, totalSamples, failedSamples, peak, mean, series }: series is the time series,
//                  downsampled to at most 600 points; a failed reading is null
//
// No URL, password, token or environment value is stored: only the knobs, the sizes and metric aggregates.
import type { InvariantResult } from '../invariants'
import { downsample, MAX_SERIES_POINTS, type ResourceSample } from './sampler'

export const SCHEMA_VERSION = 1

export interface MachineInfo {
  cpus: number
  memoryGb: number
  os: string
  k6Version?: string
}

export interface Knobs {
  scale: number
  durationScale: number
  baseline: boolean
}

export type MetricAggregate = Record<string, number>

export interface ResourceStats {
  cpuPercent: number | null
  rssMb: number | null
  connections: number | null
  waitingLocks: number | null
}

export interface LoadResult {
  schemaVersion: typeof SCHEMA_VERSION
  startedAt: string
  profile: string
  scenario: string
  passed: boolean
  machine: MachineInfo
  knobs: Knobs
  seed: Record<string, number>
  k6: { exitCode: number | null; metrics: Record<string, MetricAggregate> }
  invariants: InvariantResult[]
  resources: { intervalMs: number; totalSamples: number; failedSamples: number; peak: ResourceStats; mean: ResourceStats; series: ResourceSample[] }
}

export interface ResultParts {
  profile: string
  k6: unknown
  invariants: InvariantResult[]
  samples: ResourceSample[]
  machine: MachineInfo
  scenario?: string
  startedAt?: string
  knobs?: Knobs
  seed?: Record<string, number>
  k6ExitCode?: number | null
  intervalMs?: number
}

const KEYS = ['cpuPercent', 'rssMb', 'connections', 'waitingLocks'] as const

/** Only the numeric fields of each metric are kept. */
export function numericMetrics(k6: unknown): Record<string, MetricAggregate> {
  const metrics = (k6 as { metrics?: Record<string, unknown> } | null)?.metrics
  const kept: Record<string, MetricAggregate> = {}
  if (!metrics || typeof metrics !== 'object') return kept
  for (const [name, value] of Object.entries(metrics)) {
    if (!value || typeof value !== 'object') continue
    const numbers: MetricAggregate = {}
    for (const [field, number] of Object.entries(value)) if (typeof number === 'number' && Number.isFinite(number)) numbers[field] = number
    kept[name] = numbers
  }
  return kept
}

function stats(samples: ResourceSample[], pick: (values: number[]) => number): ResourceStats {
  const result: ResourceStats = { cpuPercent: null, rssMb: null, connections: null, waitingLocks: null }
  for (const key of KEYS) {
    const values = samples.map((sample) => sample[key]).filter((value): value is number => value !== null)
    if (values.length > 0) result[key] = Math.round(pick(values) * 10) / 10
  }
  return result
}

export function buildResult(parts: ResultParts): LoadResult {
  const failedSamples = parts.samples.filter((sample) => KEYS.some((key) => sample[key] === null)).length
  const invariantsFailed = parts.invariants.some((result) => !result.passed)
  const k6Failed = parts.k6ExitCode !== undefined && parts.k6ExitCode !== null && parts.k6ExitCode !== 0
  return {
    schemaVersion: SCHEMA_VERSION,
    startedAt: parts.startedAt ?? new Date().toISOString(),
    profile: parts.profile,
    scenario: parts.scenario ?? '',
    passed: !invariantsFailed && !k6Failed,
    machine: parts.machine,
    knobs: parts.knobs ?? { scale: 1, durationScale: 1, baseline: false },
    seed: parts.seed ?? {},
    k6: { exitCode: parts.k6ExitCode ?? null, metrics: numericMetrics(parts.k6) },
    invariants: parts.invariants,
    resources: {
      intervalMs: parts.intervalMs ?? 2000,
      totalSamples: parts.samples.length,
      failedSamples,
      peak: stats(parts.samples, (values) => Math.max(...values)),
      mean: stats(parts.samples, (values) => values.reduce((sum, value) => sum + value, 0) / values.length),
      series: downsample(parts.samples, MAX_SERIES_POINTS),
    },
  }
}

/** `20261030T101500Z-load.json` from a time and a profile. */
export function resultFileName(at: Date, profile: string): string {
  const stamp = at.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
  return `${stamp}-${profile}.json`
}

function padRows(rows: string[][]): string {
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length)))
  return rows.map((row) => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join('  ')).join('\n')
}

const MAX_TABLE_ROWS = 10
const dash = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '-' : value.toFixed(digits))

/** The short terminal table: per scenario p95 and error rate, then resources and the invariant verdict. */
export function formatResultTable(result: LoadResult): string {
  const metrics = result.k6.metrics
  // A mixed run tags its requests with the scenario; a smoke run has request names instead.
  const labelsOf = (tag: string) =>
    Object.keys(metrics)
      .filter((name) => name.startsWith(`http_req_duration{${tag}:`))
      .map((name) => name.slice(`http_req_duration{${tag}:`.length, -1))
  const tag = labelsOf('scenario').length > 0 ? 'scenario' : 'name'
  const percent = (rate: number | undefined) => (rate === undefined ? '-' : (rate * 100).toFixed(2))
  const rows: string[][] = [[tag === 'scenario' ? 'Scenario' : 'Request', 'p95 ms', 'requests', 'failed %']]
  const slowest = labelsOf(tag).sort((x, y) => (metrics[`http_req_duration{${tag}:${y}}`]?.["p(95)"] ?? 0) - (metrics[`http_req_duration{${tag}:${x}}`]?.["p(95)"] ?? 0))
  for (const label of slowest.slice(0, MAX_TABLE_ROWS)) {
    const count = metrics[`http_reqs{${tag}:${label}}`]?.count
    rows.push([label, dash(metrics[`http_req_duration{${tag}:${label}}`]?.['p(95)']), count === undefined ? '-' : String(count), percent(metrics[`http_req_failed{${tag}:${label}}`]?.value)])
  }
  if (slowest.length > MAX_TABLE_ROWS) rows.push([`(${slowest.length - MAX_TABLE_ROWS} faster ones not shown)`, '', '', ''])
  rows.push(['(all requests)', dash(metrics.http_req_duration?.['p(95)']), metrics.http_reqs?.count === undefined ? '-' : String(metrics.http_reqs.count), percent(metrics.http_req_failed?.value)])
  const { peak, mean, failedSamples, totalSamples } = result.resources
  const failedInvariants = result.invariants.filter((item) => !item.passed).map((item) => item.name)
  return [
    padRows(rows),
    `API CPU (% of one core): peak ${dash(peak.cpuPercent)}, mean ${dash(mean.cpuPercent)}   RSS MB: peak ${dash(peak.rssMb)}, mean ${dash(mean.rssMb)}`,
    `Database connections: peak ${dash(peak.connections, 0)}   waiting locks: peak ${dash(peak.waitingLocks, 0)}   (${totalSamples} samples, ${failedSamples} failed)`,
    `Invariants: ${failedInvariants.length === 0 ? `all ${result.invariants.length} passed` : `FAILED ${failedInvariants.join(', ')}`}   Result: ${result.passed ? 'passed' : 'FAILED'}`,
  ].join('\n')
}
