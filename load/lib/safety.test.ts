import { describe, expect, test } from 'bun:test'
import { assertLoadDatabase, assertLoadDatabaseName, assertLocalBaseUrl } from './safety'

describe('assertLoadDatabase', () => {
  test.each(['postgres://u:pos@127.0.0.1:5434/pos_load', 'postgres://u:pos@127.0.0.1:5434/pos_load_inv', 'postgres://u:pos@localhost:5434/pos_load'])(
    'accepts %s',
    (url) => {
      expect(() => assertLoadDatabase(url)).not.toThrow()
    },
  )

  test.each([
    ['postgres://u:pos@127.0.0.1:5434/pos', 'database name'],
    ['postgres://u:pos@127.0.0.1:5434/pos_test', 'database name'],
    ['postgres://u:pos@127.0.0.1:5434/pos_e2e', 'database name'],
    ['postgres://u:pos@db.example.com:5434/pos_load', 'host'],
    ['postgres://u:pos@10.0.0.5:5434/pos_load', 'host'],
    ['postgres://u:pos@127.0.0.1:5434', 'database name'],
    ['postgres://u:pos@127.0.0.1:5434/', 'database name'],
    ['not a url', 'valid'],
  ])('refuses %s (names the %s rule)', (url, rule) => {
    expect(() => assertLoadDatabase(url)).toThrow(rule)
  })

  test('the error never repeats the password', () => {
    try {
      assertLoadDatabase(`postgres://u:${'s3cretpw'}@db.example.com:5434/pos_load`)
    } catch (error) {
      expect(String(error)).not.toContain('s3cretpw')
      return
    }
    throw new Error('should have thrown')
  })
})

describe('assertLocalBaseUrl', () => {
  test.each(['http://localhost:3190', 'http://127.0.0.1:3190'])('accepts %s', (url) => {
    expect(() => assertLocalBaseUrl(url)).not.toThrow()
  })

  test.each(['https://pos.example.com', 'http://10.0.0.5:3190', 'nonsense'])('refuses %s', (url) => {
    expect(() => assertLocalBaseUrl(url)).toThrow()
  })
})

describe('assertLoadDatabase edge cases', () => {
  test.each([
    ['postgres://u:pos@localhost.evil.com:5434/pos_load', 'host'],
    ['postgres://127.0.0.1@evil.com:5434/pos_load', 'host'],
    ['postgres://u:pos@127.0.0.1:5434@evil.com/pos_load', 'host'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load?host=db.evil.com', 'query'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load?hostaddr=10.0.0.5', 'query'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load?dbname=pos', 'query'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load?', 'query'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load#x', 'fragment'],
    ['postgres://u:pos@a:1,b:2/pos_load', 'valid'],
    ['postgres://u:pos@127.0.0.1:5434,10.0.0.5:5434/pos_load', 'valid'],
    ['postgres://u:pos@127.0.0.1:5434/POS_LOAD', 'database name'],
    ['postgres://u:pos@127.0.0.1:5434/pos%5Fload', 'database name'],
    ['postgres://u:pos@127.0.0.1:5434/pos_load/extra', 'database name'],
    ['postgres://u:pos@[::1]:5434/pos_load', 'host'],
  ])('refuses %s', (url, rule) => {
    expect(() => assertLoadDatabase(url)).toThrow(rule)
  })
})

describe('assertLocalBaseUrl edge cases', () => {
  test.each(['http://localhost.evil.com', 'http://127.0.0.1.evil.com', 'http://localhost@evil.com', 'http://evil.com@localhost.evil.com:3190', 'https://localhost:3190'])(
    'refuses %s',
    (url) => {
      expect(() => assertLocalBaseUrl(url)).toThrow()
    },
  )
})

describe('assertLoadDatabaseName', () => {
  test.each(['pos_load', 'pos_load_seed_test'])('accepts %s', (name) => {
    expect(() => assertLoadDatabaseName(name)).not.toThrow()
  })

  test.each(['pos', 'pos_test', 'pos_e2e', 'postgres', 'POS_LOAD', 'pos_load-x', ''])('refuses "%s"', (name) => {
    expect(() => assertLoadDatabaseName(name)).toThrow('database name')
  })
})
