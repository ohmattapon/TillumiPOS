import { SQL } from 'bun'
import { beforeEach, describe, expect, test } from 'bun:test'
import { UsersService } from '../src/modules/users/service'
import { assertTestDatabase, ensureTestDatabase } from './database'
import { client, fakeMedia, ok, resetDatabase, signIn } from './harness'

beforeEach(() => resetDatabase())

describe('test harness', () => {
  test('serves the app over HTTP', async () => {
    expect(ok(await client().health.get())).toEqual({ status: 'ok' })
  })

  test('runs against the test database and the fake media server', () => {
    expect(assertTestDatabase()).toBe('pos_test')
    expect(Bun.env.MEDIA_URL).toBe(fakeMedia.url)
  })

  test('resetDatabase leaves no rows behind', async () => {
    await signIn('owner')
    expect(await UsersService.list()).toHaveLength(1)

    await resetDatabase()

    expect(await UsersService.list()).toHaveLength(0)
  })

  test('identity columns restart after a reset', async () => {
    const first = await signIn('owner')
    await resetDatabase()
    const second = await signIn('owner')

    expect(second.user.id).toBe(first.user.id)
  })
})

describe('database guard', () => {
  const original = Bun.env.DATABASE_URL

  test('refuses the development database', () => {
    Bun.env.DATABASE_URL = 'postgres://pos:pos@localhost:5433/pos'
    try {
      expect(() => assertTestDatabase()).toThrow('Refusing to run tests against database "pos"')
    } finally {
      Bun.env.DATABASE_URL = original
    }
  })

  test.each([
    'postgres://pos:pos@localhost:5433/other_test',
    'postgres://pos:pos@remote.example:5433/pos_test',
    'postgres://pos:pos@localhost:5432/pos_test',
  ])('refuses a non-exact target %s', (url) => {
    Bun.env.DATABASE_URL = url
    try { expect(() => assertTestDatabase()).toThrow('expected pos_test on localhost:5433') }
    finally { Bun.env.DATABASE_URL = original }
  })

  test('valid env cannot hide the cached connection database', async () => {
    Bun.env.DATABASE_URL = 'postgres://pos:pos@localhost:5433/pos_test'
    let truncated = false
    const wrongConnection = Object.assign(
      async () => [{ name: 'pos' }],
      { unsafe: async () => { truncated = true } },
    ) as unknown as SQL
    try {
      await expect(resetDatabase(wrongConnection)).rejects.toThrow('connected database "pos"')
      expect(truncated).toBe(false)
    } finally {
      Bun.env.DATABASE_URL = original
    }
  })

  test('explains how to start PostgreSQL when connection fails', async () => {
    const failingConnection = Object.assign(
      async () => { throw new Error('connection refused') },
      { close: async () => {} },
    ) as unknown as SQL
    await expect(ensureTestDatabase(() => failingConnection)).rejects.toThrow('bun run db:up')
  })
})
