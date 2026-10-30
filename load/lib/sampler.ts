// Samples the API process (CPU and memory) and the load database (connections, waiting locks) during a run.
//
// Cost: Linux reads two small files of /proc per sample. Windows keeps ONE long-lived PowerShell that answers a
// "tick" line with one Get-Process call; it is started once, so a sample costs a few milliseconds of PowerShell time
// rather than the ~300 ms of a fresh PowerShell per sample. The database side is one select on its own connection.
// A sample that fails is recorded with null values and counted; sampling never throws into the run.
import type { SQL } from 'bun'
import { readFile } from 'node:fs/promises'
import { assertLoadDatabaseName } from './safety'

export interface ResourceSample {
  /** Milliseconds since the sampler started. */
  t: number
  /** Percent of ONE core used since the previous sample (can pass 100 on several cores); null when the sample failed. */
  cpuPercent: number | null
  rssMb: number | null
  connections: number | null
  waitingLocks: number | null
  /** True when the CPU counter went back (a child process exited): not a sampling failure, the CPU figure is just unknown. */
  cpuReset?: boolean
}

export interface ProcessReading {
  cpuSeconds: number
  rssBytes: number
}

const DEFAULT_CLOCK_TICKS = 100
const DEFAULT_PAGE_BYTES = 4096
const DEFAULT_TIMEOUT_MS = 3000
export const MAX_SERIES_POINTS = 600

/** The sampler could not be set up (not the safety guard refusing): the run goes on without samples. */
export class SamplerStartError extends Error {}

export interface Timers {
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

const realTimers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle) }

class TimedOut extends Error {}

/** Rejects with TimedOut when the work takes longer than `ms`; the work itself is not cancelled. */
function withTimeout<T>(work: Promise<T>, ms: number, timers: Timers): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = timers.setTimeout(() => reject(new TimedOut(`no answer within ${ms} ms`)), ms)
    work.then(
      (value) => {
        timers.clearTimeout(handle)
        resolve(value)
      },
      (error) => {
        timers.clearTimeout(handle)
        reject(error)
      },
    )
  })
}

/** Parses /proc/<pid>/stat (utime + stime in clock ticks) and /proc/<pid>/statm (resident pages). */
export function parseProcReading(stat: string, statm: string, units: { clockTicks?: number; pageBytes?: number } = {}): ProcessReading | null {
  // The command name is in parentheses and may hold spaces or parentheses, so count fields after the last ")".
  const afterName = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const utime = Number(afterName[11])
  const stime = Number(afterName[12])
  const residentPages = Number(statm.trim().split(/\s+/)[1])
  if (![utime, stime, residentPages].every(Number.isFinite)) return null
  return { cpuSeconds: (utime + stime) / (units.clockTicks ?? DEFAULT_CLOCK_TICKS), rssBytes: residentPages * (units.pageBytes ?? DEFAULT_PAGE_BYTES) }
}

/** Parses the one line the PowerShell loop prints: "<cpu seconds> <working set bytes>" or "ERR". */
export function parseWindowsLine(line: string): ProcessReading | null {
  const [cpu, rss] = line.trim().split(/\s+/).map(Number)
  if (cpu === undefined || rss === undefined || !Number.isFinite(cpu) || !Number.isFinite(rss)) return null
  return { cpuSeconds: cpu, rssBytes: rss }
}

/** CPU use between two readings as percent of one core; null when time did not move forward or the counter went back. */
export function cpuPercentBetween(before: { cpuSeconds: number; atMs: number }, after: { cpuSeconds: number; atMs: number }): number | null {
  const wall = (after.atMs - before.atMs) / 1000
  const used = after.cpuSeconds - before.cpuSeconds
  if (wall <= 0 || used < 0) return null
  return Math.round((used / wall) * 1000) / 10
}

/** Keeps at most `max` points, evenly spread, always the first and the last. */
export function downsample<T>(items: T[], max = MAX_SERIES_POINTS): T[] {
  if (items.length <= max) return items
  if (max < 2) return items.slice(0, max)
  return Array.from({ length: max }, (_, index) => items[Math.round((index * (items.length - 1)) / (max - 1))]!)
}

/**
 * Keeps at most `max` samples in time order. Each stretch of the series keeps the sample with the highest value of
 * every field, so a graph of the series still shows every peak; the first and last samples are always kept.
 */
export function downsampleSamples(samples: ResourceSample[], max = MAX_SERIES_POINTS): ResourceSample[] {
  if (samples.length <= max) return samples
  const fields = ['cpuPercent', 'rssMb', 'connections', 'waitingLocks'] as const
  const buckets = Math.max(1, Math.floor((max - 2) / fields.length))
  const kept = new Set<ResourceSample>([samples[0]!, samples.at(-1)!])
  for (let bucket = 0; bucket < buckets; bucket++) {
    const part = samples.slice(Math.floor((bucket * samples.length) / buckets), Math.floor(((bucket + 1) * samples.length) / buckets))
    for (const field of fields) {
      let best: ResourceSample | null = null
      for (const sample of part) if (sample[field] !== null && (best === null || sample[field]! > best[field]!)) best = sample
      if (best) kept.add(best)
    }
  }
  return [...kept].sort((a, b) => a.t - b.t)
}

export type ReadProcess = () => Promise<ProcessReading | null>

/** `getconf <name>` as a positive number, or the fallback (with a note on stderr) when it cannot be asked. */
function getconf(name: string, fallback: number): number {
  try {
    const value = Number(Bun.spawnSync(['getconf', name], { stdout: 'pipe', stderr: 'ignore' }).stdout.toString().trim())
    if (Number.isInteger(value) && value > 0) return value
  } catch {
    // falls through
  }
  console.error(`getconf ${name} failed; assuming ${fallback} for the CPU and memory figures`)
  return fallback
}

// Linux follows the one pid only (the API is a single process there); Windows sums the pid and the children it had at start.
function linuxReader(pid: number): { read: ReadProcess; close(): void } {
  const units = { clockTicks: getconf('CLK_TCK', DEFAULT_CLOCK_TICKS), pageBytes: getconf('PAGESIZE', DEFAULT_PAGE_BYTES) }
  return {
    read: async () => parseProcReading(await readFile(`/proc/${pid}/stat`, 'utf8'), await readFile(`/proc/${pid}/statm`, 'utf8'), units),
    close() {},
  }
}

// The ids are the API and any child it has (found once at the start). Only numbers go on the command line.
const WINDOWS_SCRIPT = (pid: number) => `
$ErrorActionPreference = 'Stop'
$ids = @(${pid})
try { $ids += @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.ProcessId }) } catch {}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $p = @(Get-Process -Id $ids -ErrorAction SilentlyContinue)
    if ($p.Count -eq 0) { [Console]::Out.WriteLine('ERR'); continue }
    $cpu = ($p | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum
    $rss = ($p | Measure-Object -Property WorkingSet64 -Sum).Sum
    [Console]::Out.WriteLine(([string]$cpu) + ' ' + ([string]$rss))
  } catch { [Console]::Out.WriteLine('ERR') }
}`

function windowsReader(pid: number): { read: ReadProcess; close(): void } {
  const child = Bun.spawn(['powershell', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT(pid)], { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' })
  const lines = child.stdout.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  const nextLine = async (): Promise<string> => {
    for (;;) {
      const newline = buffered.indexOf('\n')
      if (newline >= 0) {
        const line = buffered.slice(0, newline)
        buffered = buffered.slice(newline + 1)
        return line
      }
      const chunk = await lines.read()
      if (chunk.done) throw new Error('the PowerShell sampler stopped')
      buffered += decoder.decode(chunk.value)
    }
  }
  return {
    read: async () => {
      child.stdin.write('tick\n')
      await child.stdin.flush()
      return parseWindowsLine(await nextLine())
    },
    close() {
      try {
        child.stdin.end()
      } catch {
        // already closed
      }
      child.kill()
    },
  }
}

export function createProcessReader(pid: number): { read: ReadProcess; close(): void } {
  return process.platform === 'win32' ? windowsReader(pid) : linuxReader(pid)
}

const DATABASE_QUERY = `
  select count(*)::int as connections, (count(*) filter (where wait_event_type = 'Lock'))::int as waiting
  from pg_stat_activity
  where datname = current_database() and pid <> pg_backend_pid()`

export interface SamplerOptions {
  pid: number
  /** Its own connection, opened on a pos_load* database; the sampler only reads and does not close it. */
  sql: SQL
  everyMs?: number
  /** How long a process reading or a database query may take before the sample records null for it (default 3000). */
  timeoutMs?: number
  /** For tests. */
  reader?: { read: ReadProcess; close(): void }
  now?: () => number
  timers?: Timers
}

export async function startSampler(options: SamplerOptions): Promise<{ stop(): Promise<ResourceSample[]> }> {
  const everyMs = options.everyMs ?? 2000
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? (() => performance.now())
  const timers = options.timers ?? realTimers
  const limited = <T>(work: Promise<T>) => withTimeout(work, timeoutMs, timers)

  let connected: Record<string, unknown> | undefined
  try {
    ;[connected] = await limited(options.sql.unsafe('select current_database() as name') as Promise<Record<string, unknown>[]>)
  } catch (error) {
    throw new SamplerStartError(`cannot ask the database: ${error instanceof Error ? error.message : String(error)}`)
  }
  // Refuses to sample anything but a load database, like the invariant checks do. This error is not a SamplerStartError.
  assertLoadDatabaseName(String(connected?.name ?? ''))
  let reader: { read: ReadProcess; close(): void }
  try {
    reader = options.reader ?? createProcessReader(options.pid)
  } catch (error) {
    throw new SamplerStartError(`cannot read the API process: ${error instanceof Error ? error.message : String(error)}`)
  }
  const samples: ResourceSample[] = []
  const started = now()
  let last: { cpuSeconds: number; atMs: number } | null = null
  // After one reading that never came back the reader (a PowerShell loop) may answer out of step, so it is not used again.
  let readerLost = false
  let stopping: Promise<ResourceSample[]> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> = Promise.resolve()

  async function readProcess(): Promise<ProcessReading | null> {
    if (readerLost) return null
    try {
      return await limited(reader.read())
    } catch (error) {
      if (error instanceof TimedOut) readerLost = true
      return null
    }
  }

  async function sampleOnce() {
    const atMs = now()
    const sample: ResourceSample = { t: Math.round(atMs - started), cpuPercent: null, rssMb: null, connections: null, waitingLocks: null }
    const reading = await readProcess()
    if (reading) {
      sample.rssMb = Math.round((reading.rssBytes / 1024 / 1024) * 10) / 10
      const point = { cpuSeconds: reading.cpuSeconds, atMs }
      if (last) {
        sample.cpuPercent = cpuPercentBetween(last, point)
        // The counter going back means a child process exited: the figure is unknown, but nothing failed.
        if (sample.cpuPercent === null && point.cpuSeconds < last.cpuSeconds) sample.cpuReset = true
      }
      last = point
    }
    try {
      const [row] = (await limited(options.sql.unsafe(DATABASE_QUERY) as Promise<Record<string, unknown>[]>)) as Record<string, unknown>[]
      sample.connections = Number(row!.connections)
      sample.waitingLocks = Number(row!.waiting)
    } catch {
      // stays null
    }
    samples.push(sample)
  }

  // The first reading only sets the CPU baseline, so it is not kept as a sample.
  const first = await readProcess()
  if (first) last = { cpuSeconds: first.cpuSeconds, atMs: now() }

  const schedule = () => {
    timer = timers.setTimeout(() => {
      // A sample still running (a slow database) is waited for, never overlapped.
      inFlight = sampleOnce().finally(() => {
        if (!stopping) schedule()
      })
    }, everyMs)
  }
  schedule()

  return {
    stop() {
      // Idempotent: the run stops the sampler after k6 and again in its cleanup.
      stopping ??= (async () => {
        if (timer) timers.clearTimeout(timer)
        await inFlight
        // One last sample so a short run still has a closing point.
        await sampleOnce()
        reader.close()
        return samples
      })()
      return stopping
    },
  }
}
