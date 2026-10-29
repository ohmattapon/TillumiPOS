// Runs a load test profile against its own throwaway database, API and fake bank.
//
//   LOAD_DB_ADMIN_URL=<admin connection to the local server> bun load/run.ts <profile> [--scenario <name>] [--keep-db]
//
// It refuses any database whose name does not start with pos_load, and any host but this machine. Every value
// (the admin URL, the generated passwords) comes from the environment or is made here at run time; none is written
// to a file. The real bank is never called: the API is pointed at the fake in server/test/kbank-server.ts.
import { SQL } from 'bun'
import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProcessGroup } from './lib/processes'
import { assertLoadDatabase, assertLocalBaseUrl } from './lib/safety'

const PROFILES = ['smoke', 'load', 'stress', 'spike', 'soak'] as const
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '')

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

/** The target database URL: the admin URL's server and login, with the load database's name. */
function targetUrl(adminUrl: string, name: string): string {
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return url.toString()
}

async function freePort(): Promise<number> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port as number
  await probe.stop(true)
  return port
}

async function waitFor(url: string, label: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
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
  const dbName = Bun.env.LOAD_DB_NAME ?? 'pos_load'
  // The name goes into DROP/CREATE statements, so beyond the prefix rule it may hold plain identifier characters only.
  if (!/^pos_load[a-z0-9_]*$/.test(dbName)) throw new Error('LOAD_DB_NAME must start with pos_load and hold only a-z, 0-9 and _ (database name rule)')
  const databaseUrl = targetUrl(adminUrl, dbName)
  assertLoadDatabase(databaseUrl)

  const group = createProcessGroup()
  const mediaDir = await mkdtemp(join(tmpdir(), 'pos-load-media-'))
  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    await group.stopAll()
    await rm(mediaDir, { recursive: true, force: true }).catch(() => {})
    if (!options.keepDb) await dropDatabase(adminUrl, dbName).catch(() => {})
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => void cleanup().finally(() => process.exit(130)))
  // 'exit' cannot wait: stopAll starts the kills synchronously, which is all that is needed here.
  process.on('exit', () => void group.stopAll())

  try {
    await recreateDatabase(adminUrl, dbName)

    const port = await freePort()
    const baseUrl = `http://127.0.0.1:${port}`
    assertLocalBaseUrl(baseUrl)

    const { LOAD_DB_ADMIN_URL: _admin, ...inherited } = process.env
    const apiEnv: Record<string, string | undefined> = {
      ...inherited,
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

    for (const script of ['migrate.ts', 'seed.ts']) {
      const child = group.spawn(['bun', `src/infrastructure/database/${script}`], { cwd: join(root, 'server'), env: apiEnv, stdout: 'pipe', stderr: 'pipe' })
      if ((await child.exited) !== 0) throw new Error(`${script} failed: ${await new Response(child.stderr as ReadableStream).text()}`)
    }

    group.spawn(['bun', 'src/index.ts'], { cwd: join(root, 'server'), env: apiEnv, stdout: 'ignore', stderr: 'inherit' })
    await waitFor(`${baseUrl}/api/v1/health`, 'API')

    console.log(`Load run "${options.profile}"${options.scenario ? ` (scenario ${options.scenario})` : ''}: API ready at ${baseUrl}, database ${dbName}`)
    // k6 and the checks that follow arrive in later tasks; for now the run stops once everything is up.
  } finally {
    await cleanup()
  }
}

async function withAdmin<T>(adminUrl: string, work: (admin: SQL) => Promise<T>): Promise<T> {
  const admin = new SQL(adminUrl)
  try {
    return await work(admin)
  } finally {
    await admin.close()
  }
}

async function dropDatabase(adminUrl: string, name: string) {
  await withAdmin(adminUrl, (admin) => admin.unsafe(`drop database if exists "${name}" with (force)`))
}

async function recreateDatabase(adminUrl: string, name: string) {
  await withAdmin(adminUrl, async (admin) => {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  })
}

try {
  await main()
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
