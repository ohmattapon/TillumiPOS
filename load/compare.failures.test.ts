import { describe, expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareResults, measuresOf, notComparableReasons, parseResult, runCompare } from './compare'
import { buildResult, type LoadResult } from './lib/summary'

const machine = { cpus: 8, memoryGb: 16, os: 'linux' }
type Parts = Parameters<typeof buildResult>[0]
const build = (over: Partial<Parts> = {}): LoadResult =>
  buildResult({
    profile: 'load',
    scenario: 'shop-day',
    k6: { metrics: { 'http_req_duration{name:checkout.sale}': { 'p(95)': 50 }, http_reqs: { count: 10, rate: 1 } } },
    invariants: [
      { name: 'stock_matches', passed: true, violations: 0 },
      { name: 'receipts_unique', passed: true, violations: 0 },
    ],
    samples: [{ t: 0, cpuPercent: 1, rssMb: 1, connections: 1, waitingLocks: 0 }],
    machine,
    knobs: { scale: 1, durationScale: 1, baseline: false },
    seed: { pastSales: 1 },
    k6ExitCode: 0,
    ...over,
  })
const find = (changes: ReturnType<typeof compareResults>, metric: string) => changes.find((change) => change.metric === metric)

describe('a failed run is never reported as fine', () => {
  test('invariants that could not run (the list replaced by invariants_ran) are worse against a good run', () => {
    const broken = build({ invariants: [{ name: 'invariants_ran', passed: false, violations: 1 }] })
    expect(find(compareResults(build(), broken), 'invariant invariants_ran')?.worse).toBe(true)
  })

  test('any failing invariant in the second file is worse, even one the first file never had', () => {
    const changes = compareResults(build(), build({ invariants: [{ name: 'brand_new_check', passed: false, violations: 3 }] }))
    expect(find(changes, 'invariant brand_new_check')?.worse).toBe(true)
  })

  test('an invariant that failed in both files is not worse by itself', () => {
    const failing = build({ invariants: [{ name: 'x', passed: false, violations: 1 }] })
    expect(compareResults(failing, failing).some((change) => change.worse)).toBe(false)
  })

  test('passed true to false is worse', () => {
    const changes = compareResults(build(), build({ k6ExitCode: 99 }))
    expect(find(changes, 'run passed')?.worse).toBe(true)
  })

  test('a non-zero k6 exit code that the first file did not have is worse; one it also had is not', () => {
    expect(find(compareResults(build(), build({ k6ExitCode: 99 })), 'k6 exit code')?.worse).toBe(true)
    expect(find(compareResults(build({ k6ExitCode: 99 }), build({ k6ExitCode: 99 })), 'k6 exit code')).toBeUndefined()
    expect(find(compareResults(build({ k6ExitCode: 99 }), build({ k6ExitCode: 0 })), 'k6 exit code')?.worse).toBe(false)
  })
})

describe('comparability of machines', () => {
  test('different cpus, memory, os or k6 version are reasons', () => {
    expect(notComparableReasons(build(), build({ machine: { ...machine, cpus: 4 } })).join()).toContain('cpus')
    expect(notComparableReasons(build(), build({ machine: { ...machine, memoryGb: 8 } })).join()).toContain('memoryGb')
    expect(notComparableReasons(build(), build({ machine: { ...machine, os: 'Windows_NT' } })).join()).toContain('os')
    expect(notComparableReasons(build({ machine: { ...machine, k6Version: 'v2.3.0' } }), build({ machine: { ...machine, k6Version: 'v2.4.0' } })).join()).toContain('k6Version')
    expect(notComparableReasons(build(), build())).toEqual([])
  })
})

describe('held-open requests do not pollute the overall latency', () => {
  test('the bare http_req_duration is skipped when the display stream is in the run', () => {
    const result = build({
      k6: {
        metrics: {
          http_req_duration: { 'p(95)': 4000, 'p(99)': 4000, avg: 400 },
          'http_req_duration{expected_response:true}': { 'p(95)': 4000, avg: 400 },
          'http_req_duration{name:display.stream}': { 'p(95)': 4000, avg: 4000 },
          'http_req_duration{name:checkout.sale}': { 'p(95)': 50, avg: 30 },
        },
      },
    })
    const names = [...measuresOf(result).keys()]
    expect(names).not.toContain('http_req_duration p95')
    expect(names).not.toContain('http_req_duration{expected_response:true} p95')
    expect(names).toContain('http_req_duration{name:checkout.sale} p95')
    expect(names).toContain('http_req_duration{name:display.stream} p95')
  })
})

describe('malformed files exit 2, never throw', () => {
  const write = async (name: string, content: unknown) => {
    const path = join(tmpdir(), `compare-test-${process.pid}-${name}.json`)
    await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content))
    return path
  }
  const good = () => JSON.parse(JSON.stringify(build()))
  const quiet = async (argv: string[]) => {
    const log = console.log
    const error = console.error
    console.log = () => {}
    console.error = () => {}
    try {
      return await runCompare(argv)
    } finally {
      console.log = log
      console.error = error
    }
  }

  test('each malformed v1 file is refused by parseResult', () => {
    const cases: [string, (value: any) => void][] = [
      ['no machine', (value) => delete value.machine],
      ['machine is a string', (value) => (value.machine = 'x')],
      ['no resources.mean', (value) => delete value.resources.mean],
      ['a metric that is not an object', (value) => (value.k6.metrics.http_reqs = 5)],
      ['a metric that is null', (value) => (value.k6.metrics.http_reqs = null)],
      ['an invariant without a name', (value) => (value.invariants = [{ passed: true, violations: 0 }])],
      ['an invariant that is null', (value) => (value.invariants = [null])],
      ['knobs without scale', (value) => (value.knobs = {})],
    ]
    for (const [label, breakIt] of cases) {
      const value = good()
      breakIt(value)
      expect(() => parseResult(JSON.stringify(value), 'x.json'), label).toThrow()
    }
    expect(() => parseResult(JSON.stringify(good()), 'x.json')).not.toThrow()
  })

  test('exit 2 for malformed, missing, non-JSON and wrong-version files', async () => {
    const ok = await write('ok', good())
    const noMachine = good()
    delete noMachine.machine
    expect(await quiet([ok, await write('nomachine', noMachine)])).toBe(2)
    expect(await quiet([ok, await write('text', 'nope')])).toBe(2)
    expect(await quiet([ok, await write('v2', { schemaVersion: 2 })])).toBe(2)
    expect(await quiet([ok, join(tmpdir(), 'compare-test-missing.json')])).toBe(2)
    expect(await quiet([ok])).toBe(2)
  })

  test('exit 0 for equal files, 1 for a worse one, 2 for not comparable unless --force', async () => {
    const a = await write('a', build())
    const slow = build({ k6: { metrics: { 'http_req_duration{name:checkout.sale}': { 'p(95)': 200 }, http_reqs: { count: 10, rate: 1 } } } })
    expect(await quiet([a, a])).toBe(0)
    expect(await quiet([a, await write('slow', slow)])).toBe(1)
    const other = await write('other', build({ profile: 'smoke' }))
    expect(await quiet([a, other])).toBe(2)
    expect(await quiet([a, other, '--force'])).toBe(0)
  })
})

describe('the command line', () => {
  const write = async (name: string, content: unknown) => {
    const path = join(tmpdir(), `compare-cli-${process.pid}-${name}.json`)
    await writeFile(path, JSON.stringify(content))
    return path
  }
  const run = async (argv: string[]) => {
    const lines: string[] = []
    const log = console.log
    const error = console.error
    console.log = (...parts) => void lines.push(parts.join(' '))
    console.error = (...parts) => void lines.push(parts.join(' '))
    try {
      return { code: await runCompare(argv), output: lines.join('\n') }
    } finally {
      console.log = log
      console.error = error
    }
  }

  test('a failed second run is announced even when nothing is judged worse', async () => {
    const failing = build({ invariants: [{ name: 'x', passed: false, violations: 1 }] })
    const path = await write('failed', failing)
    const { code, output } = await run([path, path])
    expect(code).toBe(0)
    expect(output).toContain('WARNING: second run FAILED')
  })

  test('a passing second run gets no warning', async () => {
    const path = await write('fine', build())
    expect((await run([path, path])).output).not.toContain('WARNING')
  })

  test('a tolerance that is not a non-negative number is a usage error', async () => {
    const path = await write('tol', build())
    for (const bad of ['abc', '-5', 'NaN', 'Infinity']) {
      const { code, output } = await run([path, path, '--tolerance', bad])
      expect(code, bad).toBe(2)
      expect(output).toContain('Usage')
    }
    expect((await run([path, path, '--tolerance', '0'])).code).toBe(0)
  })
})
