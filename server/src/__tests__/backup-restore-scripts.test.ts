import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * scripts/backup.sh and scripts/restore.sh, driven through a stand-in for `podman compose`: pg_dump answers with a
 * file the test chooses, and psql runs for real against a database of its own, so what a restore does to the
 * data is what is checked. (The scripts' Windows twins, backup.ps1 and restore.ps1, make the same checks.)
 */
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const database = new URL(Bun.env.DATABASE_URL ?? 'postgres://pos:pos@localhost:5433/pos_test')
const TEST_DB = 'pos_backup_scripts_test'

const connection: Record<string, string> = {
  PGHOST: database.hostname,
  PGPORT: database.port || '5432',
  PGUSER: decodeURIComponent(database.username),
  PGPASSWORD: decodeURIComponent(database.password),
}

const FAKE_COMPOSE = `#!/usr/bin/env bash
# Stands in for "podman compose -f docker-compose.yml <verb> ...": answers what the scripts ask of the db and app.
shift 2
verb=$1; shift
echo "$verb $*" >> "$FAKE_LOG"
case "$verb" in
  stop|start) exit 0 ;;
  exec)
    shift # -T
    service=$1; shift
    if [ "$service" = db ]; then
      command=$1; shift
      case "$command" in
        pg_dump) cat "$FAKE_DUMP"; exit "\${FAKE_DUMP_EXIT:-0}" ;;
        psql)
          args=()
          while [ $# -gt 0 ]; do
            if [ "$1" = -d ] || [ "$1" = -U ]; then [ "$1" = -d ] && args+=(-d "$FAKE_DB"); shift 2
            else args+=("$1"); shift; fi
          done
          exec psql "\${args[@]}" ;;
      esac
    fi
    exit 1 ;; # the app has no images
esac
`

let work: string
let fake: string
let log: string
let dumpFile: string

const psql = (sql: string, db = TEST_DB) => {
  const run = Bun.spawnSync(['psql', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { env: { ...process.env, ...connection }, stdout: 'pipe', stderr: 'pipe' })
  if (run.exitCode !== 0) throw new Error(run.stderr.toString())
  return run.stdout.toString().trim()
}

/** What pg_dump writes: a few hundred bytes of rows that do not compress away, and its closing line. */
const completeDump = () => {
  const rows = Array.from({ length: 40 }, (_, index) => `INSERT INTO public.shop VALUES (${index + 1}, '${crypto.randomUUID()}');`)
  return [
    '--', '-- PostgreSQL database dump', '--',
    'DROP TABLE IF EXISTS public.shop;',
    'CREATE TABLE public.shop (id integer PRIMARY KEY, name text);',
    ...rows,
    '--', '-- PostgreSQL database dump complete', '--', '',
  ].join('\n')
}
const cutOff = (dump: string) => dump.slice(0, Math.floor(dump.length * 0.6))

const run = (script: string, args: string[], extra: Record<string, string> = {}) => {
  const result = Bun.spawnSync(['bash', join(root, 'scripts', script), ...args], {
    cwd: root,
    env: { ...process.env, ...connection, POS_COMPOSE: fake, FAKE_LOG: log, FAKE_DUMP: dumpFile, FAKE_DB: TEST_DB, ...extra },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() }
}

const dumpWith = async (text: string) => writeFile(dumpFile, text)
const backupFileWith = async (text: string, name = 'easypos-20261019-100000.sql.gz') => {
  const path = join(work, name)
  await writeFile(path, gzipSync(text))
  return path
}
const commands = async () => (await readFile(log, 'utf8')).split('\n').filter(Boolean).map((line) => line.split(' ')[0])

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'easypos-backup-test-'))
  fake = join(work, 'fake-compose')
  await writeFile(fake, FAKE_COMPOSE)
  await chmod(fake, 0o755)
  log = join(work, 'calls.log')
  dumpFile = join(work, 'dump.sql')
  psql(`drop database if exists ${TEST_DB} with (force)`, 'postgres')
  psql(`create database ${TEST_DB}`, 'postgres')
})

afterAll(async () => {
  psql(`drop database if exists ${TEST_DB} with (force)`, 'postgres')
  await rm(work, { recursive: true, force: true })
})

beforeEach(async () => {
  await writeFile(log, '')
  // The shop as it is now: one table with one row that a restore must either replace or leave alone.
  psql('drop table if exists public.shop')
  psql("create table public.shop (id integer primary key, name text); insert into public.shop values (999, 'keep')")
})

describe('backup.sh', () => {
  test('keeps a complete dump as easypos-<date>.sql.gz', async () => {
    const dump = completeDump()
    await dumpWith(dump)
    const folder = await mkdtemp(join(work, 'backups-'))

    const result = run('backup.sh', [folder])

    expect(result.code).toBe(0)
    const files = await readdir(folder)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^easypos-\d{8}-\d{6}\.sql\.gz$/)
    expect(gunzipSync(await readFile(join(folder, files[0]!))).toString()).toBe(dump)
  })

  test('does not keep a dump that was cut off: it is a valid file that would wipe the shop when restored', async () => {
    await dumpWith(cutOff(completeDump()))
    const folder = await mkdtemp(join(work, 'backups-'))

    const result = run('backup.sh', [folder])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('incomplete')
    expect(await readdir(folder)).toEqual([])
  })

  test('does not keep a dump when pg_dump itself fails, even after it wrote something', async () => {
    await dumpWith(completeDump())
    const folder = await mkdtemp(join(work, 'backups-'))

    const result = run('backup.sh', [folder], { FAKE_DUMP_EXIT: '1' })

    expect(result.code).not.toBe(0)
    expect(await readdir(folder)).toEqual([])
  })
})

describe('restore.sh', () => {
  test('replaces the data with the backup, stopping the app first and starting it after', async () => {
    const file = await backupFileWith(completeDump())

    const result = run('restore.sh', [file, '--yes'])

    expect(result.code).toBe(0)
    expect(psql('select count(*) from public.shop')).toBe('40')
    expect(psql('select count(*) from public.shop where name = $$keep$$')).toBe('0')
    expect(await commands()).toEqual(['stop', 'exec', 'start'])
  })

  test('refuses a dump that was cut off before touching anything: the app keeps running and the data stays', async () => {
    const file = await backupFileWith(cutOff(completeDump()))

    const result = run('restore.sh', [file, '--yes'])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('cut off')
    expect(psql('select name from public.shop')).toBe('keep')
    expect(await commands()).toEqual([])
  })

  test('refuses a file that is not a gzip file', async () => {
    const file = join(work, 'broken.sql.gz')
    await writeFile(file, 'not gzip at all')

    const result = run('restore.sh', [file, '--yes'])

    expect(result.code).not.toBe(0)
    expect(psql('select name from public.shop')).toBe('keep')
  })

  test('a statement that fails halfway leaves the data as it was, and the app is started again', async () => {
    // Complete as far as the closing line goes, but one statement in the middle cannot run.
    const broken = completeDump().replace('CREATE TABLE public.shop (id integer PRIMARY KEY, name text);', 'CREATE TABLE public.shop (id integer PRIMARY KEY, name text);\nINSERT INTO public.nowhere VALUES (1);')
    const file = await backupFileWith(broken)

    const result = run('restore.sh', [file, '--yes'])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('left as it was')
    expect(psql('select name from public.shop')).toBe('keep')
    expect(await commands()).toEqual(['stop', 'exec', 'start'])
  })

  test('asks before replacing anything, and does nothing when the answer is not YES', async () => {
    const file = await backupFileWith(completeDump())

    const result = Bun.spawnSync(['bash', join(root, 'scripts', 'restore.sh'), file], {
      cwd: root,
      env: { ...process.env, ...connection, POS_COMPOSE: fake, FAKE_LOG: log, FAKE_DUMP: dumpFile, FAKE_DB: TEST_DB },
      stdin: new TextEncoder().encode('no\n'),
      stdout: 'pipe',
      stderr: 'pipe',
    })

    expect(result.exitCode).not.toBe(0)
    expect(psql('select name from public.shop')).toBe('keep')
    expect(await commands()).toEqual([])
  })
})
