import type { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { cpuPercentBetween, downsample, downsampleSamples, parseProcReading, parseWindowsLine, SamplerStartError, startSampler, type ProcessReading, type ResourceSample } from './sampler'
import { buildResult } from './summary'

const flush = async () => {
  for (let index = 0; index < 30; index++) await Promise.resolve()
}

/** A clock and timers that only move when the test says so. */
function fakeTimers() {
  let now = 0
  let nextId = 0
  const pending = new Map<number, { at: number; fn: () => void }>()
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++nextId
      pending.set(id, { at: now + ms, fn })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimeout: (id: ReturnType<typeof setTimeout>) => void pending.delete(id as unknown as number),
    async advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...pending.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].fn()
        await flush()
      }
      now = target
      await flush()
    },
  }
}

const reading = (cpuSeconds: number): ProcessReading => ({ cpuSeconds, rssBytes: 100 * 1024 * 1024 })
const never = () => new Promise<never>(() => {})
const fakeSql = (database = 'pos_load', handler: () => Promise<unknown[]> = async () => [{ connections: 5, waiting: 2 }]) =>
  ({ unsafe: async (query: string) => (query.includes('current_database() as name') ? [{ name: database }] : handler()) }) as unknown as SQL
const machine = { cpus: 1, memoryGb: 1, os: 'x' }

describe('sampler parsing', () => {
  const stat = '4242 (bun src/idx) S 1 4242 4242 0 -1 4194560 100 0 0 0 250 150 0 0 20 0 9 0 12345 123456789 7000 18446744073709551615'
  test('reads utime+stime and resident pages from /proc files, even with a ")" in the name', () => {
    expect(parseProcReading(stat, '30000 7000 100 1 0 5000 0')).toEqual({ cpuSeconds: 4, rssBytes: 7000 * 4096 })
    expect(parseProcReading(stat.replace('bun src/idx', 'a) b (c'), '30000 7000 100')).toEqual({ cpuSeconds: 4, rssBytes: 7000 * 4096 })
  })
  test('uses the clock tick and page size it is given', () => {
    expect(parseProcReading(stat, '30000 7000 100', { clockTicks: 200, pageBytes: 16384 })).toEqual({ cpuSeconds: 2, rssBytes: 7000 * 16384 })
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
})

describe('downsample', () => {
  test('keeps short series as they are', () => {
    expect(downsample([1, 2, 3], 600)).toEqual([1, 2, 3])
    expect(downsample([1, 2, 3, 4, 5], 2)).toEqual([1, 5])
  })

  test('downsampleSamples keeps the peak of every field, in time order, within the cap', () => {
    const samples: ResourceSample[] = Array.from({ length: 1350 }, (_, index) => ({ t: index * 2000, cpuPercent: 5, rssMb: 100, connections: 3, waitingLocks: 0 }))
    samples[311] = { ...samples[311]!, cpuPercent: 97.5 }
    samples[777] = { ...samples[777]!, rssMb: 912 }
    samples[1001] = { ...samples[1001]!, connections: 40 }
    samples[1202] = { ...samples[1202]!, waitingLocks: 9 }
    const kept = downsampleSamples(samples, 600)
    expect(kept.length).toBeLessThanOrEqual(600)
    expect(Math.max(...kept.map((item) => item.cpuPercent ?? 0))).toBe(97.5)
    expect(Math.max(...kept.map((item) => item.rssMb ?? 0))).toBe(912)
    expect(Math.max(...kept.map((item) => item.connections ?? 0))).toBe(40)
    expect(Math.max(...kept.map((item) => item.waitingLocks ?? 0))).toBe(9)
    expect(kept[0]!.t).toBe(0)
    expect(kept.at(-1)!.t).toBe(1349 * 2000)
    expect(kept.map((item) => item.t)).toEqual([...kept.map((item) => item.t)].sort((a, b) => a - b))
  })

  test('buildResult uses it, so the peak is in the series', () => {
    const samples: ResourceSample[] = Array.from({ length: 2000 }, (_, index) => ({ t: index, cpuPercent: index === 1234 ? 99 : 1, rssMb: 1, connections: 1, waitingLocks: 0 }))
    const { resources } = buildResult({ profile: 'soak', k6: null, invariants: [], samples, machine })
    expect(resources.series.length).toBeLessThanOrEqual(600)
    expect(Math.max(...resources.series.map((item) => item.cpuPercent ?? 0))).toBe(99)
  })
})

describe('startSampler', () => {
  test('refuses a database that is not a load database, with the guard error itself', async () => {
    const error = await startSampler({ pid: 1, sql: fakeSql('pos'), reader: { read: async () => null, close() {} } }).catch((caught) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SamplerStartError)
    expect(String(error.message)).toContain('database name rule')
  })

  test('a database that cannot be asked at start is a SamplerStartError', async () => {
    const sql = {
      unsafe: async () => {
        throw new Error('connection refused')
      },
    } as unknown as SQL
    await expect(startSampler({ pid: 1, sql, reader: { read: async () => null, close() {} } })).rejects.toBeInstanceOf(SamplerStartError)
  })

  test('takes one sample per interval and one closing sample on stop', async () => {
    const timers = fakeTimers()
    let cpu = 0
    const sampler = await startSampler({ pid: 1, sql: fakeSql(), reader: { read: async () => reading((cpu += 1)), close() {} }, everyMs: 2000, timers, now: timers.now })
    await timers.advance(6000)
    const samples = await sampler.stop()
    expect(samples).toHaveLength(4)
    expect(samples[0]).toMatchObject({ t: 2000, cpuPercent: 50, rssMb: 100, connections: 5, waitingLocks: 2 })
  })

  test('stop is idempotent: the same samples, no extra closing sample', async () => {
    const timers = fakeTimers()
    let closed = 0
    const sampler = await startSampler({ pid: 1, sql: fakeSql(), reader: { read: async () => reading(1), close: () => void closed++ }, everyMs: 2000, timers, now: timers.now })
    await timers.advance(2000)
    const first = await sampler.stop()
    const second = await sampler.stop()
    expect(second).toBe(first)
    expect(first).toHaveLength(2)
    expect(closed).toBe(1)
  })

  test('start does not hang on a reader that never answers', async () => {
    const timers = fakeTimers()
    let started = false
    const pending = startSampler({ pid: 1, sql: fakeSql(), reader: { read: never, close() {} }, timeoutMs: 3000, timers, now: timers.now }).then((value) => {
      started = true
      return value
    })
    await flush()
    expect(started).toBe(false)
    await timers.advance(3000)
    await pending
    expect(started).toBe(true)
  })

  test('a reader that never answers gives nulls for the process part, and the database part still works', async () => {
    const timers = fakeTimers()
    const pending = startSampler({ pid: 1, sql: fakeSql(), reader: { read: never, close() {} }, everyMs: 2000, timeoutMs: 3000, timers, now: timers.now })
    await flush()
    await timers.advance(3000)
    const sampler = await pending
    await timers.advance(2000 + 3000 + 2000 + 3000)
    const samples = await sampler.stop()
    expect(samples.length).toBeGreaterThanOrEqual(2)
    expect(samples.every((item) => item.rssMb === null && item.cpuPercent === null)).toBe(true)
    expect(samples.every((item) => item.connections === 5)).toBe(true)
  })

  test('a database query that never answers times out into nulls and stop still returns', async () => {
    const timers = fakeTimers()
    const sampler = await startSampler({ pid: 1, sql: fakeSql('pos_load', never), reader: { read: async () => reading(1), close() {} }, everyMs: 2000, timeoutMs: 3000, timers, now: timers.now })
    await timers.advance(2000 + 3000)
    const stopping = sampler.stop()
    await flush()
    await timers.advance(3000)
    const samples = await stopping
    expect(samples[0]).toMatchObject({ connections: null, waitingLocks: null, rssMb: 100 })
  })

  test('a failing reader or database gives nulls instead of throwing', async () => {
    const timers = fakeTimers()
    const sql = fakeSql('pos_load', async () => {
      throw new Error('connection lost')
    })
    const reader = {
      read: async () => {
        throw new Error('process gone')
      },
      close() {},
    }
    const sampler = await startSampler({ pid: 1, sql, reader, everyMs: 1000, timers, now: timers.now })
    await timers.advance(3000)
    const samples = await sampler.stop()
    expect(samples.length).toBeGreaterThan(2)
    expect(samples.every((item) => item.connections === null && item.rssMb === null)).toBe(true)
  })

  test('a CPU counter that goes back (a child exited) is marked as a reset, not as a failed sample', async () => {
    const timers = fakeTimers()
    const cpu = [10, 11, 5, 6, 7]
    let index = 0
    const sampler = await startSampler({ pid: 1, sql: fakeSql(), reader: { read: async () => reading(cpu[index++ % cpu.length]!), close() {} }, everyMs: 2000, timers, now: timers.now })
    await timers.advance(5000)
    const samples = await sampler.stop()
    const reset = samples.find((item) => item.cpuReset)
    expect(reset).toBeDefined()
    expect(reset!.cpuPercent).toBeNull()
    expect(samples.some((item) => item.cpuPercent !== null && !item.cpuReset)).toBe(true)
    expect(buildResult({ profile: 'load', k6: null, invariants: [], samples, machine }).resources.failedSamples).toBe(0)
  })
})
