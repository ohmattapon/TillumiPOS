import { describe, expect, test } from 'bun:test'
import { compareResults, formatChanges, notComparableReasons, parseResult } from './compare'
import { buildResult, type LoadResult } from './lib/summary'

const machine = { cpus: 8, memoryGb: 16, os: 'linux' }
function make(p95: number, options: { extra?: Record<string, Record<string, number>>; peakRss?: number; invariantOk?: boolean; scale?: number; profile?: string; seedSales?: number } = {}): LoadResult {
  return buildResult({
    profile: options.profile ?? 'load',
    scenario: 'shop-day',
    k6: { metrics: { 'http_req_duration{scenario:checkout}': { 'p(95)': p95 }, 'http_reqs': { count: 1000, rate: 10 }, ...options.extra } },
    invariants: [{ name: 'stock_matches', passed: options.invariantOk ?? true, violations: options.invariantOk === false ? 1 : 0 }],
    samples: [{ t: 0, cpuPercent: 20, rssMb: options.peakRss ?? 200, connections: 5, waitingLocks: 0 }],
    machine,
    knobs: { scale: options.scale ?? 1, durationScale: 1, baseline: false },
    seed: { pastSales: options.seedSales ?? 1000 },
  })
}
const find = (changes: ReturnType<typeof compareResults>, metric: string) => changes.find((change) => change.metric === metric)

describe('compareResults', () => {
  test('a metric 25% slower is worse, 5% slower is not', () => {
    expect(find(compareResults(make(100), make(125)), 'http_req_duration{scenario:checkout} p95')).toMatchObject({ before: 100, after: 125, changePercent: 25, worse: true })
    expect(find(compareResults(make(100), make(105)), 'http_req_duration{scenario:checkout} p95')?.worse).toBe(false)
  })

  test('faster is never worse, and the tolerance is adjustable', () => {
    expect(find(compareResults(make(100), make(60)), 'http_req_duration{scenario:checkout} p95')?.worse).toBe(false)
    expect(find(compareResults(make(100), make(105), 3), 'http_req_duration{scenario:checkout} p95')?.worse).toBe(true)
  })

  test('a metric missing from one file is reported, not a crash, and is not worse', () => {
    const changes = compareResults(make(100), make(100, { extra: { 'http_req_duration{scenario:qr}': { 'p(95)': 50 } } }))
    expect(find(changes, 'http_req_duration{scenario:qr} p95')).toMatchObject({ note: 'only in the second file', worse: false })
    const reverse = compareResults(make(100, { extra: { 'http_req_duration{scenario:qr}': { 'p(95)': 50 } } }), make(100))
    expect(find(reverse, 'http_req_duration{scenario:qr} p95')?.note).toBe('only in the first file')
  })

  test('peak memory above the tolerance is worse; fewer requests are worse', () => {
    expect(find(compareResults(make(100), make(100, { peakRss: 300 })), 'API RSS peak MB')?.worse).toBe(true)
    const fewer = make(100, { extra: { http_reqs: { count: 700, rate: 7 } } })
    expect(find(compareResults(make(100), fewer), 'http_reqs count')?.worse).toBe(true)
  })

  test('a newly failing invariant is worse whatever the tolerance', () => {
    expect(find(compareResults(make(100), make(100, { invariantOk: false }), 1000), 'invariant stock_matches')?.worse).toBe(true)
    expect(find(compareResults(make(100, { invariantOk: false }), make(100)), 'invariant stock_matches')?.worse).toBe(false)
  })

  test('tiny absolute changes do not count (0 to 0.2 ms, 0 to 0.1% errors)', () => {
    const a = make(0.1, { extra: { http_req_failed: { value: 0, passes: 0, fails: 10 } } })
    const b = make(0.5, { extra: { http_req_failed: { value: 0.001, passes: 0, fails: 10 } } })
    expect(compareResults(a, b).some((change) => change.worse)).toBe(false)
  })

  test('dropped iterations going up is worse', () => {
    const a = make(100, { extra: { dropped_iterations: { count: 0, rate: 0 } } })
    const b = make(100, { extra: { dropped_iterations: { count: 40, rate: 1 } } })
    expect(find(compareResults(a, b), 'dropped_iterations count')?.worse).toBe(true)
  })
})

describe('notComparableReasons', () => {
  test('the same knobs and seed are comparable', () => {
    expect(notComparableReasons(make(100), make(120))).toEqual([])
  })
  test('a different profile, LOAD_SCALE or seed size is named', () => {
    expect(notComparableReasons(make(100), make(100, { profile: 'smoke' })).join()).toContain('profile')
    expect(notComparableReasons(make(100), make(100, { scale: 0.2 })).join()).toContain('LOAD_SCALE')
    expect(notComparableReasons(make(100), make(100, { seedSales: 5 })).join()).toContain('pastSales')
  })
})

describe('parseResult and formatChanges', () => {
  test('refuses another schema version and garbage', () => {
    expect(() => parseResult('{"schemaVersion":2}', 'x.json')).toThrow(/schema version 2/)
    expect(() => parseResult('nope', 'x.json')).toThrow(/not valid JSON/)
    expect(() => parseResult('null', 'x.json')).toThrow(/schema version/)
    expect(() => parseResult(JSON.stringify({ schemaVersion: 1 }), 'x.json')).toThrow(/missing or has a wrong/)
    expect(parseResult(JSON.stringify(make(100)), 'x.json').profile).toBe('load')
  })
  test('prints a table that marks the worse rows', () => {
    const text = formatChanges(compareResults(make(100), make(130)), 10)
    expect(text).toContain('WORSE')
    expect(text).toContain('+30.0%')
  })
})
