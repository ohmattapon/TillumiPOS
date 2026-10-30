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

// A request that the display scenario holds open for seconds on purpose. k6 cannot leave one request out of its built-in
// metrics, so while it is in a run the overall figures below are a mix of real latency and this hold time and mean nothing.
const HELD_OPEN_REQUEST = 'http_req_duration{name:display.stream}'
const POLLUTED_BY_HELD_OPEN = /^(http_req_duration|http_req_duration\{expected_response:true\}|http_req_waiting|http_req_receiving)$/

/** Every comparable number of a result, by a stable name. */
export function measuresOf(result: LoadResult): Map<string, Measure> {
  const measures = new Map<string, Measure>()
  const heldOpen = HELD_OPEN_REQUEST in result.k6.metrics
  for (const [name, aggregate] of Object.entries(result.k6.metrics)) {
    if (heldOpen && POLLUTED_BY_HELD_OPEN.test(name)) continue
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
  measures.set('run passed', { value: result.passed ? 1 : 0, better: 'higher', unit: 'count' })
  if (typeof result.k6.exitCode === 'number') measures.set('k6 exit code', { value: result.k6.exitCode, better: 'lower', unit: 'count' })
  for (const invariant of result.invariants) measures.set(`invariant ${invariant.name}`, { value: invariant.passed ? 1 : 0, better: 'higher', unit: 'count' })
  return measures
}

function percentChange(before: number, after: number): number {
  if (before === after) return 0
  if (before === 0) return after > 0 ? Infinity : -Infinity
  return ((after - before) / Math.abs(before)) * 100
}

/** A failure the first file did not have is worse whatever the tolerance. */
function newFailure(name: string, left: number | undefined, right: number): boolean {
  if (name.startsWith('invariant ')) return right === 0
  if (name === 'run passed') return right === 0 && left !== 0
  if (name === 'k6 exit code') return right !== 0 && (left ?? 0) === 0
  return false
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
      changes.push({ metric: name, before: left?.value ?? NaN, after: right?.value ?? NaN, changePercent: NaN, worse: right !== undefined && newFailure(name, undefined, right.value), note: left ? 'only in the first file' : 'only in the second file' })
      continue
    }
    if (left.value === right.value) continue
    const changePercent = percentChange(left.value, right.value)
    const grew = right.value > left.value
    const wrongWay = (left.better === 'lower' && grew) || (left.better === 'higher' && !grew)
    const big = Math.abs(right.value - left.value) >= MIN_ABSOLUTE[left.unit] && Math.abs(changePercent) > tolerancePercent
    const failed = newFailure(name, left.value, right.value)
    // A failure the first file already had is not "newly worse", and a recovery is never worse.
    const judged = name.startsWith('invariant ') || name === 'run passed' || name === 'k6 exit code' ? failed && left.value !== right.value : wrongWay && big
    changes.push({ metric: name, before: left.value, after: right.value, changePercent, worse: judged })
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
  for (const field of ['cpus', 'memoryGb', 'os', 'k6Version'] as const) differ(`machine ${field}`, a.machine[field], b.machine[field])
  differ('LOAD_SCALE', a.knobs.scale, b.knobs.scale)
  differ('LOAD_DURATION_SCALE', a.knobs.durationScale, b.knobs.durationScale)
  const keys = new Set([...Object.keys(a.seed), ...Object.keys(b.seed)])
  for (const key of keys) differ(`seed size ${key}`, a.seed[key], b.seed[key])
  return reasons
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const isNumberOrNull = (value: unknown) => value === null || isNumber(value)

/** Throws a short message unless `text` is a result file of the schema this code reads, with every field compare uses. */
export function parseResult(text: string, label: string): LoadResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
  if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`${label} has schema version ${String(isObject(value) ? value.schemaVersion : value)}; this compare reads version ${SCHEMA_VERSION}`)
  const bad = (what: string) => new Error(`${label} is missing or has a wrong ${what} (schema version ${SCHEMA_VERSION})`)
  const { machine, knobs, seed, k6, resources, invariants } = value
  if (typeof value.profile !== 'string' || typeof value.scenario !== 'string' || typeof value.passed !== 'boolean') throw bad('profile, scenario or passed')
  if (!isObject(machine) || !isNumber(machine.cpus) || !isNumber(machine.memoryGb) || typeof machine.os !== 'string') throw bad('machine')
  if (!isObject(knobs) || !isNumber(knobs.scale) || !isNumber(knobs.durationScale)) throw bad('knobs')
  if (!isObject(seed) || !Object.values(seed).every(isNumber)) throw bad('seed')
  if (!isObject(k6) || !isObject(k6.metrics) || !Object.values(k6.metrics).every((metric) => isObject(metric) && Object.values(metric).every(isNumber))) throw bad('k6.metrics')
  if (!isObject(resources)) throw bad('resources')
  for (const part of [resources.peak, resources.mean]) {
    if (!isObject(part) || !['cpuPercent', 'rssMb', 'connections', 'waitingLocks'].every((key) => isNumberOrNull(part[key]))) throw bad('resources.peak or resources.mean')
  }
  if (!Array.isArray(invariants) || !invariants.every((item) => isObject(item) && typeof item.name === 'string' && typeof item.passed === 'boolean')) throw bad('invariants')
  return value as unknown as LoadResult
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

export async function runCompare(argv: string[]): Promise<number> {
  try {
    return await compareFiles(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
}

async function compareFiles(argv: string[]): Promise<number> {
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
  // Said whatever else is printed: two equally broken runs show no change, which must not read as fine.
  if (!b.passed) console.log('WARNING: second run FAILED (passed: false); a table with no WORSE rows does not mean it is healthy')
  const changes = compareResults(a, b, tolerance)
  console.log(formatChanges(changes, tolerance))
  return changes.some((change) => change.worse) ? 1 : 0
}

if (import.meta.main) process.exit(await runCompare(process.argv.slice(2)))
