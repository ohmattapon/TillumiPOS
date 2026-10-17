import { afterEach, describe, expect, test } from 'bun:test'
import { assertTestDatabase, ensureTestDatabase } from './database'

// Unit tests of the guard only: they must run without any database.
const saved = { url: Bun.env.DATABASE_URL, allow: Bun.env.TEST_DATABASE_ALLOW }

afterEach(() => {
  Bun.env.DATABASE_URL = saved.url
  if (saved.allow === undefined) delete Bun.env.TEST_DATABASE_ALLOW
  else Bun.env.TEST_DATABASE_ALLOW = saved.allow
})

const HOST = 'ep-example.ap-southeast-1.aws.neon.tech'

describe('an explicitly allowed throwaway database', () => {
  test('is accepted when it is the one the owner named, query options included', () => {
    Bun.env.TEST_DATABASE_ALLOW = `${HOST}/pos_e2e`
    Bun.env.DATABASE_URL = `postgresql://u:p@${HOST}/pos_e2e?sslmode=require`

    expect(assertTestDatabase()).toBe('pos_e2e')
  })

  test('refuses another database on the same host', () => {
    Bun.env.TEST_DATABASE_ALLOW = `${HOST}/pos_e2e`
    Bun.env.DATABASE_URL = `postgresql://u:p@${HOST}/neondb?sslmode=require`

    expect(() => assertTestDatabase()).toThrow('Refusing to run tests against database "neondb"')
  })

  test('refuses the named database on another host', () => {
    Bun.env.TEST_DATABASE_ALLOW = `${HOST}/pos_e2e`
    Bun.env.DATABASE_URL = 'postgresql://u:p@other.example.com/pos_e2e?sslmode=require'

    expect(() => assertTestDatabase()).toThrow('Refusing to run tests against database "pos_e2e"')
  })

  test('is ignored unless it is set, so a remote database stays refused by default', () => {
    delete Bun.env.TEST_DATABASE_ALLOW
    Bun.env.DATABASE_URL = `postgresql://u:p@${HOST}/pos_e2e?sslmode=require`

    expect(() => assertTestDatabase()).toThrow('expected pos_test on localhost:5433')
  })

  test('does not create a database on the server, because the owner made it', async () => {
    Bun.env.TEST_DATABASE_ALLOW = `${HOST}/pos_e2e`
    Bun.env.DATABASE_URL = `postgresql://u:p@${HOST}/pos_e2e?sslmode=require`
    let connected = false

    await ensureTestDatabase(() => {
      connected = true
      throw new Error('must not connect to the admin database')
    })

    expect(connected).toBe(false)
  })
})
