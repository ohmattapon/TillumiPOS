import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildK6Args, findK6, K6_ENTRY } from './k6'

describe('buildK6Args', () => {
  const args = buildK6Args({ name: 'smoke', baseUrl: 'http://127.0.0.1:3190' }, 'catalog', 'out/summary.json')

  test('starts with the run command, the summary file and the scenario', () => {
    expect(args.slice(0, 5)).toEqual(['run', '--summary-export', 'out/summary.json', '--env', 'SCENARIO=catalog'])
  })

  test('passes the profile and the base URL and ends with the entry script', () => {
    expect(args).toContain('PROFILE=smoke')
    expect(args).toContain('BASE_URL=http://127.0.0.1:3190')
    expect(args.at(-1)).toBe(K6_ENTRY)
  })

  test('every --env value is a name=value pair', () => {
    args.forEach((arg, index) => {
      if (arg === '--env') expect(args[index + 1]).toMatch(/^[A-Z_]+=./)
    })
  })

  test('refuses a base URL that is not this machine', () => {
    expect(() => buildK6Args({ name: 'smoke', baseUrl: 'http://example.com' }, 'catalog', 'o.json')).toThrow('local base URL rule')
  })
})

describe('findK6', () => {
  const exe = process.platform === 'win32' ? 'k6.exe' : 'k6'

  test('rejects with the install command when k6 is nowhere', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'pos-load-nok6-'))
    try {
      await expect(findK6({ path: empty, programFiles: empty })).rejects.toThrow('winget install GrafanaLabs.k6')
    } finally {
      await rm(empty, { recursive: true, force: true })
    }
  })

  test('finds k6 on the PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pos-load-k6path-'))
    try {
      await writeFile(join(dir, exe), '')
      expect(await findK6({ path: dir, programFiles: join(dir, 'none') })).toBe(join(dir, exe))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('falls back to the Program Files install folder', async () => {
    const programFiles = await mkdtemp(join(tmpdir(), 'pos-load-k6pf-'))
    try {
      await mkdir(join(programFiles, 'k6'))
      await writeFile(join(programFiles, 'k6', exe), '')
      expect(await findK6({ path: join(programFiles, 'none'), programFiles })).toBe(join(programFiles, 'k6', exe))
    } finally {
      await rm(programFiles, { recursive: true, force: true })
    }
  })
})
