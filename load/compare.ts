// Compares two load result files (see load/lib/summary.ts for the schema).
//
//   bun load/compare.ts <before.json> <after.json> [--tolerance 10] [--force]
//
// Exit codes: 0 nothing is worse beyond the tolerance, 1 something is worse, 2 the files are not comparable (a
// different profile, scenario, seed sizes, LOAD_SCALE or LOAD_DURATION_SCALE; --force diffs them anyway) or one cannot
// be read or has another schema version.
import { readFile } from 'node:fs/promises'
import { SCHEMA_VERSION, type LoadResult } from './lib/summary'

export interface Change {
  metric: string
  before: number
  after: number
  changePercent: number
  worse: boolean
}

export interface Difference extends Change {
  note?: string
}

// Smallest change that counts, so 0 -> 0.2 ms or 0.1% -> 0.3% errors is not reported as a regression.
const MIN_ABSOLUTE = { ms: 1, rate: 0.005, count: 1, percent: 1, mb: 1 } as const
type Unit = keyof typeof MIN_ABSOLUTE

interface Measure {
  value: number
  /** 'lower' means a bigger number is worse; 'higher' means a smaller number is worse; 'none' is shown but never judged. */
  better: 'lower' | 'higher' | 'none'
  unit: Unit
}

const LATENCY_FIELDS: [string, string][] = [['p(95)', 'p95'], ['p(99)', 'p99'], ['avg', 'avg']]
const HIGHER_IS_BETTER_COUNTS = /^(http_reqs|iterations)(\{|$)/
const LOWER_IS_BETTER_COUNTS = /^dropped_iterations(\{|$)/

/** Every comparable number of a result, by a stable name. */
export function measuresOf(result: LoadResult): Map<string, Measure> {
  const measures = new Map<string, Measure>()
  for (const [name, aggregate] of Object.entries(result.k6.metrics)) {
    const isTime = name.startsWith('http_req_') || /duration|latency|time/.test(name)
    for (const [field, label] of LATENCY_FIELDS) {
      const value = aggregate[field]
      if (value !== undefined && isTime) measures.set(`${name} ${label}`, { value, better: 'lower', unit: 'ms' })
    }
    if (aggregate.count !== undefined && aggregate.rate !== undefined && isTime === false) {
      measures.set(`${name} count`, {
        value: aggregate.count,
        better: LOWER_IS_BETTER_COUNTS.test(name) ? 'lower' : HIGHER_IS_BETTER_COUNTS.test(name) ? 'higher' : 'none',
        unit: 'count',
      })
    }
    if (name === 'checks' && aggregate.fails !== undefined && aggregate.passes !== undefined) {
      const total = aggregate.fails + aggregate.passes
      measures.set('checks failed rate', { value: total === 0 ? 0 : aggregate.fails / total, better: 'lower', unit: 'rate' })
    } else if (aggregate.value !== undefined && aggregate.count === undefined && /failed|error/.test(name)) {
      measures.set(`${name} rate`, { value: aggregate.value, better: 'lower', unit: 'rate' })
    }
  }
  const { peak, mean } = result.resources
  const resource: [string, number | null, Unit][] = [
    ['API CPU peak %', peak.cpuPercent, 'percent'],
    ['API CPU mean %', mean.cpuPercent, 'percent'],
    ['API RSS peak MB', peak.rssMb, 'mb'],
    ['API RSS mean MB', mean.rssMb, 'mb'],
    ['database connections peak', peak.connections, 'count'],
    ['waiting locks peak', peak.waitingLocks, 'count'],
  ]
  for (const [name, value, unit] of resource) if (value !== null) measures.set(name, { value, better: 'lower', unit })
  for (const invariant of result.invariants) measures.set(`invariant ${invariant.name}`, { value: invariant.passed ? 1 : 0, better: 'higher', unit: 'count' })
  return measures
}

function percentChange(before: number, after: number): number {
  if (before === after) return 0
  if (before === 0) return after > 0 ? Infinity : -Infinity
  return ((after - before) / Math.abs(before)) * 100
}

/**
 * Every metric whose value changed, with how much and whether it got worse by more than `tolerancePercent`.
 * A metric present in only one file is reported with NaN on the missing side and never counts as worse.
 * A passing invariant that now fails is always worse.
 */
export function compareResults(a: LoadResult, b: LoadResult, tolerancePercent = 10): Difference[] {
  const before = measuresOf(a)
  const after = measuresOf(b)
  const changes: Difference[] = []
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const left = before.get(name)
    const right = after.get(name)
    if (!left || !right) {
      changes.push({ metric: name, before: left?.value ?? NaN, after: right?.value ?? NaN, changePercent: NaN, worse: false, note: left ? 'only in the first file' : 'only in the second file' })
      continue
    }
    if (left.value === right.value) continue
    const changePercent = percentChange(left.value, right.value)
    const grew = right.value > left.value
    const wrongWay = (left.better === 'lower' && grew) || (left.better === 'higher' && !grew)
    const big = Math.abs(right.value - left.value) >= MIN_ABSOLUTE[left.unit] && Math.abs(changePercent) > tolerancePercent
    const invariantBroke = name.startsWith('invariant ') && left.value === 1 && right.value === 0
    changes.push({ metric: name, before: left.value, after: right.value, changePercent, worse: invariantBroke || (wrongWay && big) })
  }
  return changes
}

/** Why two results cannot be judged against each other; empty when they can. */
export function notComparableReasons(a: LoadResult, b: LoadResult): string[] {
  const reasons: string[] = []
  const differ = (what: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) reasons.push(`${what} differs: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`)
  }
  differ('profile', a.profile, b.profile)
  differ('scenario', a.scenario, b.scenario)
  differ('LOAD_SCALE', a.knobs.scale, b.knobs.scale)
  differ('LOAD_DURATION_SCALE', a.knobs.durationScale, b.knobs.durationScale)
  const keys = new Set([...Object.keys(a.seed), ...Object.keys(b.seed)])
  for (const key of keys) differ(`seed size ${key}`, a.seed[key], b.seed[key])
  return reasons
}

/** Throws a short message unless `value` looks like a result file of the schema this code reads. */
export function parseResult(text: string, label: string): LoadResult {
  let value: Partial<LoadResult>
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  if (!value || typeof value !== 'object' || value.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`${label} has schema version ${String((value as { schemaVersion?: unknown } | null)?.schemaVersion)}; this compare reads version ${SCHEMA_VERSION}`)
  if (!value.k6?.metrics || !value.resources?.peak || !value.knobs || !value.seed || !Array.isArray(value.invariants)) throw new Error(`${label} is missing fields of schema version ${SCHEMA_VERSION}`)
  return value as LoadResult
}

const show = (value: number) => (Number.isNaN(value) ? '-' : Number.isInteger(value) ? String(value) : value.toFixed(2))

export function formatChanges(changes: Difference[], tolerancePercent: number): string {
  if (changes.length === 0) return 'No metric changed.'
  const rows = [['Metric', 'before', 'after', 'change', '']]
  // The worse ones first, then the biggest moves.
  const ordered = [...changes].sort((x, y) => Number(y.worse) - Number(x.worse) || Math.abs(Number.isFinite(y.changePercent) ? y.changePercent : 1e9) - Math.abs(Number.isFinite(x.changePercent) ? x.changePercent : 1e9))
  for (const change of ordered) {
    const percent = Number.isNaN(change.changePercent) ? '' : Number.isFinite(change.changePercent) ? `${change.changePercent > 0 ? '+' : ''}${change.changePercent.toFixed(1)}%` : 'new'
    rows.push([change.metric, show(change.before), show(change.after), percent, change.worse ? 'WORSE' : (change.note ?? '')])
  }
  const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)))
  const table = rows.map((row) => row.map((cell, column) => (column === 0 || column === 4 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join('  ').trimEnd()).join('\n')
  const worse = changes.filter((change) => change.worse).length
  return `${table}\n${worse} metric(s) worse by more than ${tolerancePercent}%`
}

async function main(argv: string[]): Promise<number> {
  const usage = 'Usage: bun load/compare.ts <before.json> <after.json> [--tolerance 10] [--force]'
  const files: string[] = []
  let tolerance = 10
  let force = false
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--force') force = true
    else if (argv[index] === '--tolerance' && argv[index + 1] !== undefined) tolerance = Number(argv[++index])
    else if (!argv[index]!.startsWith('--')) files.push(argv[index]!)
    else {
      console.error(usage)
      return 2
    }
  }
  if (files.length !== 2 || !Number.isFinite(tolerance) || tolerance < 0) {
    console.error(usage)
    return 2
  }
  let a: LoadResult
  let b: LoadResult
  try {
    a = parseResult(await readFile(files[0]!, 'utf8'), files[0]!)
    b = parseResult(await readFile(files[1]!, 'utf8'), files[1]!)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  const reasons = notComparableReasons(a, b)
  if (reasons.length > 0) {
    console.log(`NOT COMPARABLE:\n${reasons.map((reason) => `  ${reason}`).join('\n')}`)
    if (!force) {
      console.log('Use --force to diff them anyway.')
      return 2
    }
  }
  const sameMachine = JSON.stringify([a.machine.cpus, a.machine.memoryGb, a.machine.os]) === JSON.stringify([b.machine.cpus, b.machine.memoryGb, b.machine.os])
  if (!sameMachine) console.log('Note: the two runs were made on different machines.')
  const changes = compareResults(a, b, tolerance)
  console.log(formatChanges(changes, tolerance))
  return changes.some((change) => change.worse) ? 1 : 0
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
