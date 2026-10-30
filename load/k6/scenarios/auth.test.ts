import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The auth scenario locks a lockprobe user for 15 minutes, so no other scenario may sign in as one: it would fail
// for a reason that has nothing to do with the system under test.
const scenariosDir = import.meta.dir
const scenarioFiles = readdirSync(scenariosDir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))

test('auth.ts is the only scenario that uses the authUsers', () => {
  expect(scenarioFiles).toContain('auth.ts')
  const users = scenarioFiles.filter((name) => /authUsers|lockprobe/.test(readFileSync(join(scenariosDir, name), 'utf8')))
  expect(users).toEqual(['auth.ts'])
})

test('no shared k6 library file uses the authUsers either', () => {
  const libDir = join(scenariosDir, '..', 'lib')
  const users = readdirSync(libDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .filter((name) => /authUsers|lockprobe/.test(readFileSync(join(libDir, name), 'utf8')))
  expect(users).toEqual([])
})
