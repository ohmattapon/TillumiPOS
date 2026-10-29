// Runs a load test profile against its own throwaway database, API and fake bank.
//
//   LOAD_DB_ADMIN_URL=<admin connection to the local server> bun load/run.ts <profile> [--scenario <name>] [--keep-db]
//
// It refuses any database whose name does not start with pos_load, and any host but this machine. Every value
// (the admin URL, the generated passwords) comes from the environment or is made here at run time; none is written
// to a file. The real bank is never called: the API is pointed at the fake in server/test/kbank-server.ts.
import { SQL } from 'bun'
import { randomBytes, randomInt } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dropDatabase, inheritedEnv, migrateAndSeedBase, recreateDatabase, targetUrl } from './lib/database'
import { buildK6Args, findK6 } from './lib/k6'
import { createProcessGroup } from './lib/processes'
import { redactUrls } from './lib/redact'
import { assertLoadDatabase, assertLocalBaseUrl } from './lib/safety'
import { SEED_DEFAULTS, seedLoadData, type SeedOptions } from './seed'

const PROFILES = ['smoke', 'load', 'stress', 'spike', 'soak'] as const
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')

interface Options {
  profile: (typeof PROFILES)[number]
  scenario: string | null
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
  return { profile: profile as Options['profile'], scenario, keepDb }
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
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
  const mediaDir = await mkdtemp(join(tmpdir(), 'pos-load-media-'))
  // One cleanup however many times it is asked for, so a second Ctrl+C waits for the first instead of exiting early.
  let cleaning: Promise<void> | null = null
  const cleanup = () =>
    (cleaning ??= (async () => {
      await group.stopAll()
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

    await migrateAndSeedBase(apiEnv, group.spawn)
    // Made here and handed to the scenarios later; never printed or written down.
    const cashierPassword = randomBytes(18).toString('base64url')
    const cashierPin = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const seedSizes = seedSizesFromEnv()
    const seedSql = new SQL(databaseUrl)
    const seedStarted = performance.now()
    // History ends at the start of today, so the reports have this month and this year to compute.
    const seeded = await seedLoadData(seedSql, { ...seedSizes, cashierPassword, cashierPin, referenceDate: new Date() }).finally(() => seedSql.close())
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

    console.log(`Load run "${options.profile}"${options.scenario ? ` (scenario ${options.scenario})` : ''}: API ready at ${baseUrl}, database ${dbName}`)

    // The ids and logins reach k6 through its environment only: a command line can be read by other processes.
    const k6 = await findK6()
    const scenario = options.scenario ?? 'catalog'
    const summaryFile = join(mediaDir, 'k6-summary.json')
    const k6Env = {
      ...inheritedEnv(),
      SEED_JSON: JSON.stringify(seeded),
      USERS_JSON: JSON.stringify(seeded.cashierUsernames.map((username) => ({ username, password: cashierPassword }))),
    }
    // k6 prints its own end-of-test summary on this terminal; it holds request names and numbers, no credentials.
    const k6Run = group.spawn([k6, ...buildK6Args({ name: options.profile, baseUrl }, scenario, summaryFile)], { cwd: root, env: k6Env, stdout: 'inherit', stderr: 'inherit' })
    const k6Exit = await k6Run.exited
    const summary = JSON.parse(await readFile(summaryFile, 'utf8').catch(() => 'null')) as { metrics?: Record<string, { value?: number; passes?: number; fails?: number }> } | null
    const failedRate = summary?.metrics?.expected_failed?.value
    console.log(`k6 finished with exit code ${k6Exit}; expected_failed rate ${failedRate ?? 'unknown'}`)
    // The invariant checks and the result file arrive in later tasks.
    if (k6Exit !== 0) throw new Error(`k6 failed with exit code ${k6Exit} (a threshold was crossed or the script stopped)`)
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
