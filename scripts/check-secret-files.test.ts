import { describe, expect, test } from 'bun:test'
import { findSecretFiles } from './check-secret-files'

describe('findSecretFiles', () => {
  test('finds env files, dev vars and anything under .wrangler, in any folder and with either slash', () => {
    expect(
      findSecretFiles(['.env', '.env.local', 'apps/web/.env', 'apps\\media\\.dev.vars', 'apps/media/.wrangler/state/x.json']),
    ).toEqual(['.env', '.env.local', 'apps/web/.env', 'apps/media/.dev.vars', 'apps/media/.wrangler/state/x.json'])
  })

  test('lets the tracked placeholder and test config through, and ordinary files', () => {
    expect(findSecretFiles(['.env.example', 'apps/api/.env.test', 'apps/web/src/main.tsx', 'docs/env.md'])).toEqual([])
  })
})
