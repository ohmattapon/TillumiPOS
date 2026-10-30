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
}

export interface ProcessReading {
  cpuSeconds: number
  rssBytes: number
}

const LINUX_CLOCK_TICKS = 100
const LINUX_PAGE_BYTES = 4096
export const MAX_SERIES_POINTS = 600

/** Parses /proc/<pid>/stat (utime + stime in clock ticks) and /proc/<pid>/statm (resident pages). */
export function parseProcReading(stat: string, statm: string): ProcessReading | null {
  // The command name is in parentheses and may hold spaces or parentheses, so count fields after the last ")".
  const afterName = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
  const utime = Number(afterName[11])
  const stime = Number(afterName[12])
  const residentPages = Number(statm.trim().split(/\s+/)[1])
  if (![utime, stime, residentPages].every(Number.isFinite)) return null
  return { cpuSeconds: (utime + stime) / LINUX_CLOCK_TICKS, rssBytes: residentPages * LINUX_PAGE_BYTES }
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

export type ReadProcess = () => Promise<ProcessReading | null>

function linuxReader(pid: number): { read: ReadProcess; close(): void } {
  return {
    read: async () => parseProcReading(await readFile(`/proc/${pid}/stat`, 'utf8'), await readFile(`/proc/${pid}/statm`, 'utf8')),
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
  /** For tests. */
  reader?: { read: ReadProcess; close(): void }
  now?: () => number
}

export async function startSampler(options: SamplerOptions): Promise<{ stop(): Promise<ResourceSample[]> }> {
  const everyMs = options.everyMs ?? 2000
  const now = options.now ?? (() => performance.now())
  // Refuses to sample anything but a load database, like the invariant checks do.
  const [connected] = await options.sql.unsafe('select current_database() as name')
  assertLoadDatabaseName(String(connected?.name ?? ''))
  const reader = options.reader ?? createProcessReader(options.pid)
  const samples: ResourceSample[] = []
  const started = now()
  let last: { cpuSeconds: number; atMs: number } | null = null
  let running = true
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> = Promise.resolve()

  async function sampleOnce() {
    const atMs = now()
    const sample: ResourceSample = { t: Math.round(atMs - started), cpuPercent: null, rssMb: null, connections: null, waitingLocks: null }
    try {
      const reading = await reader.read()
      if (reading) {
        sample.rssMb = Math.round((reading.rssBytes / 1024 / 1024) * 10) / 10
        const point = { cpuSeconds: reading.cpuSeconds, atMs }
        if (last) sample.cpuPercent = cpuPercentBetween(last, point)
        last = point
      }
    } catch {
      // stays null
    }
    try {
      const [row] = await options.sql.unsafe(DATABASE_QUERY)
      sample.connections = Number(row.connections)
      sample.waitingLocks = Number(row.waiting)
    } catch {
      // stays null
    }
    samples.push(sample)
  }

  // The first reading only sets the CPU baseline, so it is not kept as a sample.
  try {
    const first = await reader.read()
    if (first) last = { cpuSeconds: first.cpuSeconds, atMs: now() }
  } catch {
    // the first real sample will show null
  }

  const schedule = () => {
    timer = setTimeout(() => {
      // A sample still running (a slow database) is waited for, never overlapped.
      inFlight = sampleOnce().finally(() => {
        if (running) schedule()
      })
    }, everyMs)
  }
  schedule()

  return {
    async stop() {
      running = false
      if (timer) clearTimeout(timer)
      await inFlight
      // One last sample so a short run still has a closing point.
      await sampleOnce()
      reader.close()
      return samples
    },
  }
}
