import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

// The auth scenario locks a lockprobe user for 15 minutes, so no other file that runs in k6 may use one: it would fail
// for a reason that has nothing to do with the system under test. Only code counts; a comment may name them.
const k6Dir = join(import.meta.dir, '..')

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const codeOf = (path: string) => stripComments(readFileSync(path, 'utf8'))
const sourcesIn = (dir: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'))
    .map((name) => join(dir, name))
const usesProbes = (path: string) => /authUsers|lockprobe/.test(codeOf(path))

test('stripComments drops comments and keeps code', () => {
  expect(stripComments('a // authUsers\nb /* lockprobe */ c')).not.toMatch(/authUsers|lockprobe/)
  expect(stripComments("const u = seed.authUsers // x")).toContain('seed.authUsers')
})

test('auth.ts is the only scenario that uses the authUsers', () => {
  const scenarios = sourcesIn(join(k6Dir, 'scenarios'))
  expect(scenarios.some((path) => path.endsWith('auth.ts'))).toBe(true)
  expect(scenarios.filter(usesProbes).map((path) => basename(path))).toEqual(['auth.ts'])
})

test('neither the shared k6 libraries, nor main.ts, nor profiles.ts use the authUsers', () => {
  const others = [...sourcesIn(join(k6Dir, 'lib')), join(k6Dir, 'main.ts'), join(k6Dir, 'profiles.ts')]
  expect(others.filter(usesProbes)).toEqual([])
})
