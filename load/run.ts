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
import { fileURLToPath } from 'node:url'
import { createProcessGroup } from './lib/processes'
import { redactUrls } from './lib/redact'
import { assertLoadDatabase, assertLocalBaseUrl } from './lib/safety'

const PROFILES = ['smoke', 'load', 'stress', 'spike', 'soak'] as const
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')

// What a child process may inherit: only what Windows and Bun need to start. Bun auto-loads the repo's .env into
// this process, so passing everything on would hand unrelated secrets and alternate database settings to the API.
const INHERITED_ENV = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'SystemDrive', 'ComSpec', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'TZ']

function inheritedEnv(): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const key of INHERITED_ENV) {
    const value = process.env[key]
    if (value !== undefined) kept[key] = value
  }
  return kept
}

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
  // Only the server and login are taken over: a query string could carry host or dbname overrides.
  url.search = ''
  url.hash = ''
  return url.toString()
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

    for (const script of ['migrate.ts', 'seed.ts']) {
      const child = group.spawn(['bun', `src/infrastructure/database/${script}`], { cwd: join(root, 'server'), env: apiEnv, stdout: 'pipe', stderr: 'pipe' })
      if ((await child.exited) !== 0) throw new Error(`${script} failed: ${redactUrls(await new Response(child.stderr as ReadableStream).text())}`)
    }

    const api = group.spawn(['bun', 'src/index.ts'], { cwd: join(root, 'server'), env: apiEnv, stdout: 'ignore', stderr: 'pipe' })
    // The API's own error output can name the connection string, so it is shown redacted.
    void (async () => {
      for await (const chunk of api.stderr as ReadableStream<Uint8Array>) process.stderr.write(redactUrls(new TextDecoder().decode(chunk)))
    })()
    await waitFor(`${baseUrl}/api/v1/health`, 'API', api)

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
