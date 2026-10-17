import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS_FOLDER } from './migrations-folder'

test('points at the repo-root drizzle folder whatever the working directory', () => {
  expect(MIGRATIONS_FOLDER.replaceAll('\\', '/')).toMatch(/\/drizzle$/)
  expect(existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))).toBe(true)
  expect(existsSync(join(MIGRATIONS_FOLDER, '0018_shop_features.sql'))).toBe(true)
})
