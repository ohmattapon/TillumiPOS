// Runs a load test profile against its own throwaway database, API and fake bank.
//
//   LOAD_DB_ADMIN_URL=<admin connection to the local server> bun load/run.ts <profile> [--scenario <name>] [--keep-db]
//
// Profiles: smoke (1 VU for a minute; any one scenario, catalog by default), load (the shop-day mix for 10 minutes),
// stress (steps up until it breaks), spike (ten times the load for a minute), soak (moderate, 45 minutes). The four
// non-smoke profiles take shop-day (the default), one part of it alone (checkout, orders, qr, members, reports, stock,
// display) or contention; catalog and auth run in smoke only. A pair that makes no sense is refused before anything
// is created (load/k6/lib/mix.ts validateRun).
//
//   LOAD_SCALE=0.2            multiplies every arrival rate (default 1)
//   LOAD_DURATION_SCALE=0.15  a time-lapse (default 1): every stage's length x f and every rate / f, so a short run
//                             keeps all the arrivals of the profile and is 1/f times as intense (0.15 on load is
//                             about 6.7x the lunch peak); its numbers are not comparable with a full-length run
//   LOAD_BASELINE=1           latency thresholds cannot fail the run (a first run records the baseline); checks,
//                             error rates and the scenario counters stay strict (default off)
//
// It refuses any database whose name does not start with pos_load, and any host but this machine. Every value
// (the admin URL, the generated passwords) comes from the environment or is made here at run time; none is written
// to a file. The real bank is never called: the API is pointed at the fake in server/test/kbank-server.ts.
import { SQL, type Server } from 'bun'
import { randomBytes, randomInt } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dropDatabase, inheritedEnv, migrateAndSeedBase, recreateDatabase, targetUrl } from './lib/database'
import { startFakeBankControl, startFakeBankFront } from './lib/fake-bank-control'
import { buildK6Args, findK6 } from './lib/k6'
import { checkInvariants, formatInvariants, type InvariantResult } from './invariants'
import { createProcessGroup } from './lib/processes'
import { redactUrls } from './lib/redact'
import { assertLoadDatabase, assertLocalBaseUrl } from './lib/safety'
import { droppedNote, timeLapseNote } from './lib/run-notes'
import { createSlotClaims } from './lib/slot-claims'
import { claimCapacities, defaultScenario, parseKnobs, PROFILES, validateRun } from './k6/lib/mix'
import { SEED_DEFAULTS, seedLoadData, type SeedOptions } from './seed'

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')

interface Options {
  profile: (typeof PROFILES)[number]
  scenario: string
  keepDb: boolean
}

function parseArgs(argv: string[]): Options {
  const usage = `Usage: bun load/run.ts <${PROFILES.join('|')}> [--scenario <name>] [--keep-db]`
  const [profile, ...rest] = argv
  if (!PROFILES.includes(profile as Options['profile'])) throw new Error(usage)
  let scenario: string | null = null
  let keepDb = false
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === '--keep-db') keepDb = true
    else if (rest[index] === '--scenario' && rest[index + 1]) scenario = rest[++index]!
    else throw new Error(usage)
  }
  // A pair with no shape is refused here, before a database is created.
  const chosen = scenario ?? defaultScenario(profile!)
  validateRun(profile!, chosen)
  return { profile: profile as Options['profile'], scenario: chosen, keepDb }
}

/** Seed sizes from LOAD_SEED_<NAME> (for example LOAD_SEED_PAST_SALES=5000); unset ones keep the seed's default. */
function seedSizesFromEnv(): SeedOptions {
  const sizes: SeedOptions = {}
  for (const key of Object.keys(SEED_DEFAULTS) as (keyof typeof SEED_DEFAULTS)[]) {
    const raw = Bun.env[`LOAD_SEED_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`]
    if (raw === undefined) continue
    if (!/^\d+$/.test(raw)) throw new Error(`LOAD_SEED_${key} must be a whole number`)
    sizes[key] = Number(raw)
  }
  return sizes
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port as number
  await probe.stop(true)
  return port
}

async function waitFor(url: string, label: string, child: { exitCode: number | null }) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`${label} stopped with exit code ${child.exitCode} before it answered at ${url}`)
    try {
      if ((await fetch(url)).status < 500) return
    } catch {
      // not up yet
    }
    await Bun.sleep(500)
  }
  throw new Error(`${label} did not start at ${url}`)
}

type Summary = { metrics?: Record<string, Record<string, number | undefined>> } | null

/** What each scenario of the run did, the arrivals k6 could not start, and in baseline mode the latency it recorded. */
function printSummary(summary: Summary, profile: string, baseline: boolean) {
  const metrics = summary?.metrics ?? {}
  const perScenario = Object.entries(metrics).filter(([key]) => key.startsWith('iterations{scenario:'))
  if (perScenario.length > 0) console.log(`Iterations: ${perScenario.map(([key, value]) => `${key.slice('iterations{scenario:'.length, -1)} ${value.count ?? 0}`).join(', ')}`)
  const dropped = droppedNote(profile, metrics.dropped_iterations?.count, metrics.iterations?.count)
  if (dropped) console.log(dropped)
  if (!baseline) return
  console.log('Baseline latency (p95 ms; not judged in this run):')
  for (const [key, value] of Object.entries(metrics).filter(([name]) => name.startsWith('http_req_duration{')))
    console.log(`  ${key.slice('http_req_duration'.length)} ${value['p(95)']?.toFixed(1) ?? 'no samples'}`)
}

function k6Failure(exit: number, profile: string): string {
  if (exit !== 99) return `k6 failed with exit code ${exit} (the script stopped; see its output above)`
  const finding = profile === 'stress' || profile === 'spike' ? `; for the ${profile} profile that is the finding, not a broken script` : ''
  return `k6 crossed a threshold (exit code 99): the summary above marks which${finding}`
}

/** Runs the post-run checks on their own connection and prints them; a check that cannot run counts as failed. */
async function runInvariants(databaseUrl: string): Promise<InvariantResult[]> {
  const sql = new SQL(databaseUrl)
  let results: InvariantResult[]
  try {
    results = await checkInvariants(sql)
  } catch (error) {
    results = [{ name: 'invariants_ran', passed: false, violations: 1, sample: [redactUrls(error instanceof Error ? error.message : String(error))] }]
  } finally {
    await sql.close()
  }
  console.log(formatInvariants(results))
  return results
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  // Checked before the database is made, so a typo costs nothing.
  const knobs = parseKnobs(Bun.env)
  const adminUrl = Bun.env.LOAD_DB_ADMIN_URL
  if (!adminUrl) throw new Error('Set LOAD_DB_ADMIN_URL to the admin connection of the local PostgreSQL server')
  // The target URL drops the query string, but the admin connection itself is opened from this URL as given.
  if (adminUrl.includes('?') || adminUrl.includes('#')) throw new Error('LOAD_DB_ADMIN_URL must not have a query string or fragment (query rule)')
  const dbName =Bun.env.LOAD_DB_NAME ?? 'pos_load'
  // The name goes into DROP/CREATE statements, so beyond the prefix rule it may hold plain identifier characters only.
  if (!/^pos_load[a-z0-9_]*$/.test(dbName)) throw new Error('LOAD_DB_NAME must start with pos_load and hold only a-z, 0-9 and _ (database name rule)')
  const databaseUrl = targetUrl(adminUrl, dbName)
  assertLoadDatabase(databaseUrl)

  const group = createProcessGroup()
  // The fake bank's own servers live in this process, so they are stopped here rather than by the process group.
  const bankServers: Server<unknown>[] = []
  const mediaDir = await mkdtemp(join(tmpdir(), 'pos-load-media-'))
  // One cleanup however many times it is asked for, so a second Ctrl+C waits for the first instead of exiting early.
  let cleaning: Promise<void> | null = null
  const cleanup = () =>
    (cleaning ??= (async () => {
      await group.stopAll()
      for (const server of bankServers.splice(0)) await server.stop(true).catch(() => {})
      await rm(mediaDir, { recursive: true, force: true }).catch(() => {})
      if (!options.keepDb) await dropDatabase(adminUrl, dbName).catch(() => {})
    })())
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void cleanup().finally(() => process.exit(130)))
  // 'exit' cannot wait: stopAll starts the kills synchronously, which is all that is needed here.
  process.on('exit', () => void group.stopAll())

  try {
    await recreateDatabase(adminUrl, dbName)

    const port = await freePort()
    const baseUrl = `http://127.0.0.1:${port}`
    assertLocalBaseUrl(baseUrl)

    const apiEnv: Record<string, string | undefined> = {
      ...inheritedEnv(),
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      JWT_SECRET: randomBytes(32).toString('hex'),
      MEDIA_STORAGE: 'local',
      MEDIA_DIR: mediaDir,
      COOKIE_SECURE: 'false',
      CHECKOUT_MODE: 'shifts',
      SEED_OWNER_PASSWORD: randomBytes(18).toString('base64url'),
      // The real bank is never part of a load run.
      SCB_API_KEY: '',
      SCB_API_SECRET: '',
      SCB_BILLER_ID: '',
      SCB_REF3_PREFIX: '',
    }
    // The fake bank lives in this process; this points the API at it and sets every KBANK_* value.
    const { fakeKbank, KBANK_ENV_KEYS } = await import('../server/test/kbank-server')
    for (const key of KBANK_ENV_KEYS) delete apiEnv[key]
    fakeKbank.enableIn(apiEnv)
    // The API reaches the fake through a front that can hold back one bank call, and k6 plays the customer through
    // a control on 127.0.0.1 (see load/lib/fake-bank-control.ts).
    const bankFront = startFakeBankFront(fakeKbank)
    bankServers.push(bankFront.server)
    apiEnv.KBANK_API_BASE_URL = bankFront.url
    // The same control hands out the slots (registers, member slices) the VUs of each scenario claim.
    const bankControl = startFakeBankControl(fakeKbank, await freePort(), bankFront, createSlotClaims(claimCapacities(options.profile, options.scenario)))
    bankServers.push(bankControl)

    await migrateAndSeedBase(apiEnv, group.spawn)
    // Made here and handed to the scenarios later; never printed or written down.
    const cashierPassword = randomBytes(18).toString('base64url')
    const cashierPin = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const seedSizes = seedSizesFromEnv()
    // History ends at the start of this day; k6 counts its report ranges back from the same instant.
    const referenceDate = new Date()
    const seedSql = new SQL(databaseUrl)
    const seedStarted = performance.now()
    // History ends at the start of today, so the reports have this month and this year to compute.
    const seeded = await seedLoadData(seedSql, { ...seedSizes, cashierPassword, cashierPin, referenceDate }).finally(() => seedSql.close())
    console.log(
      `Seeded in ${((performance.now() - seedStarted) / 1000).toFixed(1)}s: ${seeded.productIds.length + seeded.hotProductIds.length} products (${seeded.hotProductIds.length} hot), ` +
        `${seedSizes.pastSales ?? SEED_DEFAULTS.pastSales} past bills, ${seeded.memberIds.length} members, ${seeded.couponCodes.length} coupons, ${seeded.cashierUsernames.length} cashiers + ${seeded.authUsers.length} auth users, ${seeded.registerIds.length} registers`,
    )

    const api = group.spawn(['bun', 'src/index.ts'], { cwd: join(root, 'server'), env: apiEnv, stdout: 'ignore', stderr: 'pipe' })
    // The API's own error output can name the connection string, so it is shown redacted.
    void (async () => {
      for await (const chunk of api.stderr as ReadableStream<Uint8Array>) process.stderr.write(redactUrls(new TextDecoder().decode(chunk)))
    })()
    await waitFor(`${baseUrl}/api/v1/health`, 'API', api)

    console.log(`Load run "${options.profile}" (scenario ${options.scenario}, LOAD_SCALE ${knobs.scale}, LOAD_DURATION_SCALE ${knobs.durationScale}${knobs.baseline ? ', baseline' : ''}): API ready at ${baseUrl}, database ${dbName}`)
    const lapse = timeLapseNote(knobs.durationScale)
    if (lapse) console.log(lapse)

    // The ids and logins reach k6 through its environment only: a command line can be read by other processes.
    const k6 = await findK6()
    const scenario = options.scenario
    const summaryFile = join(mediaDir, 'k6-summary.json')
    const k6Env = {
      ...inheritedEnv(),
      SEED_JSON: JSON.stringify(seeded),
      FAKE_BANK_CONTROL_URL: `http://127.0.0.1:${bankControl.port}`,
      // Every seeded user shares this PIN (the auth scenario uses it); it is never printed.
      USER_PIN: cashierPin,
      // The owner's login is the one the API was seeded with ("admin"); only k6's environment holds it.
      REFERENCE_DATE: referenceDate.toISOString(),
      OWNER_JSON: JSON.stringify({ username: 'admin', password: apiEnv.SEED_OWNER_PASSWORD }),
      USERS_JSON: JSON.stringify(seeded.cashierUsernames.map((username) => ({ username, password: cashierPassword }))),
      LOAD_SCALE: String(knobs.scale),
      LOAD_DURATION_SCALE: String(knobs.durationScale),
      LOAD_BASELINE: knobs.baseline ? '1' : '0',
    }
    // k6 prints its own end-of-test summary on this terminal; it holds request names and numbers, no credentials.
    const k6Run = group.spawn([k6, ...buildK6Args({ name: options.profile, baseUrl }, scenario, summaryFile)], { cwd: root, env: k6Env, stdout: 'inherit', stderr: 'inherit' })
    const k6Exit = await k6Run.exited
    const summary = JSON.parse(await readFile(summaryFile, 'utf8').catch(() => 'null')) as Summary
    const failedRate = summary?.metrics?.expected_failed?.value
    console.log(`k6 finished with exit code ${k6Exit}; expected_failed rate ${failedRate ?? 'unknown'}`)
    printSummary(summary, options.profile, knobs.baseline)
    // Checked whatever k6 said, and before the database is dropped: a run with good latency and broken data fails.
    const invariants = await runInvariants(databaseUrl)
    const failedInvariants = invariants.filter((result) => !result.passed)
    if (failedInvariants.length > 0)
      console.log(`Invariants failed in database ${dbName}${options.keepDb ? ' (kept)' : '; it is dropped now, rerun with --keep-db to look at it'}`)
    // The result file arrives in a later task.
    const failures = [
      ...(k6Exit !== 0 ? [k6Failure(k6Exit, options.profile)] : []),
      ...(failedInvariants.length > 0 ? [`${failedInvariants.length} invariant(s) failed: ${failedInvariants.map((result) => result.name).join(', ')}`] : []),
    ]
    if (failures.length > 0) throw new Error(failures.join('\n'))
  } finally {
    await cleanup()
  }
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
