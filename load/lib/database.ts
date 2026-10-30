// Creating, preparing and dropping a throwaway load database. Every name passes the safety guard first.
import { SQL } from 'bun'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redactUrls } from './redact'
import { assertLoadDatabase } from './safety'

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '')

// What a child process may inherit: only what Windows and Bun need to start. bunfig.toml sets env = false, so Bun does not load
// the repo's .env here, but the shell can still hold unrelated secrets and alternate database settings; passing
// everything on would hand them to the API.
const INHERITED_ENV = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'SystemDrive', 'ComSpec', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'TZ']

export function inheritedEnv(): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const key of INHERITED_ENV) {
    const value = process.env[key]
    if (value !== undefined) kept[key] = value
  }
  return kept
}

/** The target database URL: the admin URL's server and login, with the load database's name. */
export function targetUrl(adminUrl: string, name: string): string {
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  // Only the server and login are taken over: a query string could carry host or dbname overrides.
  url.search = ''
  url.hash = ''
  return url.toString()
}

async function withAdmin<T>(adminUrl: string, name: string, work: (admin: SQL) => Promise<T>): Promise<T> {
  // The name goes into DROP/CREATE statements, so it must pass the guard before any connection is opened.
  assertLoadDatabase(targetUrl(adminUrl, name))
  const admin = new SQL(adminUrl)
  try {
    return await work(admin)
  } finally {
    await admin.close()
  }
}

export async function dropDatabase(adminUrl: string, name: string) {
  await withAdmin(adminUrl, name, (admin) => admin.unsafe(`drop database if exists "${name}" with (force)`))
}

export async function recreateDatabase(adminUrl: string, name: string) {
  await withAdmin(adminUrl, name, async (admin) => {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}"`)
  })
}

/** Recreates `name` as a copy of `template` (which must have no open connection); both names pass the guard. */
export async function cloneDatabase(adminUrl: string, template: string, name: string) {
  assertLoadDatabase(targetUrl(adminUrl, template))
  await withAdmin(adminUrl, name, async (admin) => {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
    await admin.unsafe(`create database "${name}" template "${template}"`)
  })
}

type Spawn = (command: string[], options: { cwd: string; env: Record<string, string | undefined>; stdout: 'pipe'; stderr: 'pipe' }) => {
  exited: Promise<number>
  stderr: unknown
}

/**
 * Runs the API's migrations and its base seed (the MAIN branch, the system roles and the owner "admin") against
 * the database in `env.DATABASE_URL`. `env` must carry everything the API's env check asks for.
 */
export async function migrateAndSeedBase(env: Record<string, string | undefined>, spawn: Spawn = Bun.spawn) {
  assertLoadDatabase(env.DATABASE_URL ?? '')
  for (const script of ['migrate.ts', 'seed.ts']) {
    const child = spawn(['bun', `src/infrastructure/database/${script}`], { cwd: join(root, 'server'), env, stdout: 'pipe', stderr: 'pipe' })
    if ((await child.exited) !== 0) throw new Error(`${script} failed: ${redactUrls(await new Response(child.stderr as ReadableStream).text())}`)
  }
}

/** The smallest environment the migrate and base seed scripts accept, for a test that has no API to start. */
export function baseSetupEnv(databaseUrl: string, ownerPassword: string): Record<string, string> {
  return {
    ...inheritedEnv(),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'),
    MEDIA_STORAGE: 'none',
    SEED_OWNER_PASSWORD: ownerPassword,
  }
}
