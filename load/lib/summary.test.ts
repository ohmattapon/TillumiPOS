import { describe, expect, test } from 'bun:test'
import type { ResourceSample } from './sampler'
import { buildResult, formatResultTable, resultFileName } from './summary'

const machine = { cpus: 8, memoryGb: 16, os: 'linux' }
const sample = (t: number, cpu: number | null, rss: number | null, connections: number | null, locks: number | null): ResourceSample => ({ t, cpuPercent: cpu, rssMb: rss, connections, waitingLocks: locks })
const k6 = {
  metrics: {
    'http_req_duration{scenario:checkout}': { avg: 40, 'p(95)': 120.5, 'p(99)': 200, med: 30 },
    'http_req_failed{scenario:checkout}': { value: 0.01, passes: 1, fails: 99 },
    'http_reqs{scenario:checkout}': { count: 500, rate: 8.3 },
    dropped_iterations: { count: 3, rate: 0.05 },
  },
}

describe('buildResult', () => {
  test('keeps the k6 trend p95 per metric name', () => {
    const result = buildResult({ profile: 'load', k6, invariants: [], samples: [], machine })
    expect(result.k6.metrics['http_req_duration{scenario:checkout}']!['p(95)']).toBe(120.5)
    expect(result.schemaVersion).toBe(1)
  })

  test('copies the invariants and fails the result when any failed', () => {
    const ok = { name: 'a', passed: true, violations: 0 }
    const bad = { name: 'b', passed: false, violations: 2, sample: [{ id: 1 }] }
    expect(buildResult({ profile: 'load', k6, invariants: [ok], samples: [], machine }).passed).toBe(true)
    const failed = buildResult({ profile: 'load', k6, invariants: [ok, bad], samples: [], machine })
    expect(failed.passed).toBe(false)
    expect(failed.invariants).toEqual([ok, bad])
  })

  test('fails the result when the invariants could not run or k6 failed', () => {
    const couldNotRun = { name: 'invariants_ran', passed: false, violations: 1 }
    expect(buildResult({ profile: 'load', k6, invariants: [couldNotRun], samples: [], machine }).passed).toBe(false)
    expect(buildResult({ profile: 'load', k6, invariants: [], samples: [], machine, k6ExitCode: 99 }).passed).toBe(false)
  })

  test('computes peak and mean of the samples and counts the failed ones', () => {
    const samples = [sample(0, 10, 100, 2, 0), sample(2000, 30, 140, 6, 1), sample(4000, null, null, null, null)]
    const { resources } = buildResult({ profile: 'load', k6, invariants: [], samples, machine })
    expect(resources.peak).toEqual({ cpuPercent: 30, rssMb: 140, connections: 6, waitingLocks: 1 })
    expect(resources.mean).toEqual({ cpuPercent: 20, rssMb: 120, connections: 4, waitingLocks: 0.5 })
    expect(resources.failedSamples).toBe(1)
    expect(resources.totalSamples).toBe(3)
  })

  test('caps the series at 600 points and keeps the first and last', () => {
    const samples = Array.from({ length: 1350 }, (_, index) => sample(index * 2000, 1, 1, 1, 0))
    const { resources } = buildResult({ profile: 'soak', k6, invariants: [], samples, machine })
    expect(resources.series.length).toBeLessThanOrEqual(600)
    expect(resources.series[0]!.t).toBe(0)
    expect(resources.series.at(-1)!.t).toBe(1349 * 2000)
    expect(resources.totalSamples).toBe(1350)
  })

  test('copies metric aggregates only: strings, tags and unknown keys never reach the file', () => {
    const secret = `postgres://pos:${'hunter2'}@127.0.0.1:5434/pos_load`
    const dirty = {
      options: { env: { OWNER_JSON: secret } },
      root_group: { name: secret },
      metrics: { 'http_reqs{url:http://x/?token=abc123}': { count: 4, rate: 1, tags: secret, thresholds: { [secret]: true } } },
    }
    const text = JSON.stringify(buildResult({ profile: 'smoke', k6: dirty, invariants: [], samples: [], machine }))
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('OWNER_JSON')
    expect(text).not.toContain('postgres://')
    expect(text).not.toContain('abc123')
    expect(JSON.parse(text).k6.metrics['http_reqs{url:[redacted-url]']).toEqual({ count: 4, rate: 1 })
  })
})

describe('resultFileName', () => {
  test('uses the UTC time and the profile', () => {
    expect(resultFileName(new Date('2026-10-30T10:15:07.123Z'), 'load')).toBe('20261030T101507Z-load.json')
  })
})

describe('formatResultTable', () => {
  test('shows per scenario p95 and error rate, resources and the verdict', () => {
    const result = buildResult({ profile: 'load', k6, invariants: [{ name: 'x', passed: false, violations: 1 }], samples: [sample(0, 12.5, 150, 7, 1)], machine })
    const table = formatResultTable(result)
    expect(table).toContain('checkout')
    expect(table).toContain('120.5')
    expect(table).toContain('1.00')
    expect(table).toContain('peak 12.5')
    expect(table).toContain('FAILED x')
  })
})

describe('formatResultTable with a held-open display stream', () => {
  const held = {
    metrics: {
      http_req_duration: { 'p(95)': 4000.4, avg: 400 },
      http_reqs: { count: 380, rate: 4 },
      http_req_failed: { value: 0.01 },
      'http_req_duration{name:display.stream}': { 'p(95)': 4000.1 },
      'http_req_duration{name:checkout.sale}': { 'p(95)': 60 },
      'http_req_duration{name:checkout.quote}': { 'p(95)': 120 },
    },
  }
  const table = () => formatResultTable(buildResult({ profile: 'load', k6: held, invariants: [], samples: [], machine }))

  test('the overall latency is not shown, only the request count and failed rate', () => {
    const text = table()
    const overall = text.split('\n').find((line) => line.startsWith('(all requests)'))!
    expect(overall).not.toContain('4000.4')
    expect(overall).toContain('380')
  })

  test('the display stream is its own labelled row at the bottom, not at the top', () => {
    const lines = table().split('\n')
    const names = lines.map((line) => line.split(/\s{2,}/)[0]!)
    const stream = names.findIndex((name) => name.startsWith('display.stream'))
    expect(lines[stream]).toContain('held open')
    expect(names.findIndex((name) => name === 'checkout.quote')).toBeLessThan(stream)
    expect(names.findIndex((name) => name === 'checkout.sale')).toBeLessThan(stream)
  })
})
