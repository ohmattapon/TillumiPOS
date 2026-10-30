import { describe, expect, test } from 'bun:test'
import { downsample, parseProcReading, parseWindowsLine, cpuPercentBetween, startSampler, type ResourceSample } from './sampler'
import { buildResult, formatResultTable, resultFileName } from './summary'
import type { SQL } from 'bun'

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
    expect(resources.series).toHaveLength(600)
    expect(resources.series[0]!.t).toBe(0)
    expect(resources.series[599]!.t).toBe(1349 * 2000)
    expect(resources.totalSamples).toBe(1350)
  })

  test('copies metric aggregates only: strings, tags and unknown keys never reach the file', () => {
    const secret = 'postgres://pos:hunter2@127.0.0.1:5434/pos_load'
    const dirty = {
      options: { env: { OWNER_JSON: secret } },
      root_group: { name: secret },
      metrics: { 'http_reqs{url:http://x/?token=abc123}': { count: 4, rate: 1, tags: secret, thresholds: { [secret]: true } } },
    }
    const text = JSON.stringify(buildResult({ profile: 'smoke', k6: dirty, invariants: [], samples: [], machine }))
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('OWNER_JSON')
    expect(text).not.toContain('postgres://')
    expect(JSON.parse(text).k6.metrics['http_reqs{url:http://x/?token=abc123}']).toEqual({ count: 4, rate: 1 })
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

describe('sampler parsing', () => {
  const stat = '4242 (bun src/idx) S 1 4242 4242 0 -1 4194560 100 0 0 0 250 150 0 0 20 0 9 0 12345 123456789 7000 18446744073709551615'
  test('reads utime+stime and resident pages from /proc files, even with a ")" in the name', () => {
    expect(parseProcReading(stat, '30000 7000 100 1 0 5000 0')).toEqual({ cpuSeconds: 4, rssBytes: 7000 * 4096 })
    expect(parseProcReading(stat.replace('bun src/idx', 'a) b (c'), '30000 7000 100')).toEqual({ cpuSeconds: 4, rssBytes: 7000 * 4096 })
  })
  test('returns null for garbage', () => {
    expect(parseProcReading('', '')).toBeNull()
  })
  test('reads the PowerShell line', () => {
    expect(parseWindowsLine('12.5 104857600\r')).toEqual({ cpuSeconds: 12.5, rssBytes: 104857600 })
    expect(parseWindowsLine('ERR')).toBeNull()
  })
  test('computes percent of one core and refuses a backwards counter', () => {
    expect(cpuPercentBetween({ cpuSeconds: 1, atMs: 0 }, { cpuSeconds: 2, atMs: 2000 })).toBe(50)
    expect(cpuPercentBetween({ cpuSeconds: 2, atMs: 0 }, { cpuSeconds: 1, atMs: 2000 })).toBeNull()
    expect(cpuPercentBetween({ cpuSeconds: 1, atMs: 5 }, { cpuSeconds: 2, atMs: 5 })).toBeNull()
  })
  test('downsample keeps short series as they are', () => {
    expect(downsample([1, 2, 3], 600)).toEqual([1, 2, 3])
    expect(downsample([1, 2, 3, 4, 5], 2)).toEqual([1, 5])
  })
})

describe('startSampler', () => {
  const fakeSql = (database: string, fail = false) =>
    ({
      unsafe: async (query: string) => {
        if (query.includes('current_database() as name')) return [{ name: database }]
        if (fail) throw new Error('connection lost')
        return [{ connections: 5, waiting: 2 }]
      },
    }) as unknown as SQL

  test('refuses a database that is not a load database', async () => {
    const reader = { read: async () => null, close() {} }
    await expect(startSampler({ pid: 1, sql: fakeSql('pos'), reader })).rejects.toThrow(/database name rule/)
  })

  test('records samples, and a failing reader or database gives nulls instead of throwing', async () => {
    let clock = 0
    let cpu = 0
    const reader = {
      read: async () => {
        cpu += 1
        if (cpu === 3) throw new Error('process gone')
        return { cpuSeconds: cpu, rssBytes: 100 * 1024 * 1024 }
      },
      close() {},
    }
    const sampler = await startSampler({ pid: 1, sql: fakeSql('pos_load'), reader, everyMs: 5, now: () => (clock += 1000) })
    await Bun.sleep(40)
    const samples = await sampler.stop()
    expect(samples.length).toBeGreaterThan(2)
    expect(samples[0]!.connections).toBe(5)
    expect(samples[0]!.waitingLocks).toBe(2)
    expect(samples[0]!.rssMb).toBe(100)
    expect(samples.some((item) => item.rssMb === null)).toBe(true)

    const broken = await startSampler({ pid: 1, sql: fakeSql('pos_load', true), reader: { read: async () => null, close() {} }, everyMs: 5 })
    await Bun.sleep(15)
    const brokenSamples = await broken.stop()
    expect(brokenSamples.length).toBeGreaterThan(0)
    expect(brokenSamples.every((item) => item.connections === null && item.rssMb === null)).toBe(true)
  })
})
