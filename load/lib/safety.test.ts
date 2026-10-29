import { describe, expect, test } from 'bun:test'
import { assertLoadDatabase, assertLocalBaseUrl } from './safety'

describe('assertLoadDatabase', () => {
  test.each(['postgres://u:p@127.0.0.1:5434/pos_load', 'postgres://u:p@127.0.0.1:5434/pos_load_inv', 'postgres://u:p@localhost:5434/pos_load'])(
    'accepts %s',
    (url) => {
      expect(() => assertLoadDatabase(url)).not.toThrow()
    },
  )

  test.each([
    ['postgres://u:p@127.0.0.1:5434/pos', 'database name'],
    ['postgres://u:p@127.0.0.1:5434/pos_test', 'database name'],
    ['postgres://u:p@127.0.0.1:5434/pos_e2e', 'database name'],
    ['postgres://u:p@db.example.com:5434/pos_load', 'host'],
    ['postgres://u:p@10.0.0.5:5434/pos_load', 'host'],
    ['postgres://u:p@127.0.0.1:5434', 'database name'],
    ['postgres://u:p@127.0.0.1:5434/', 'database name'],
    ['not a url', 'valid'],
  ])('refuses %s (names the %s rule)', (url, rule) => {
    expect(() => assertLoadDatabase(url)).toThrow(rule)
  })

  test('the error never repeats the password', () => {
    try {
      assertLoadDatabase('postgres://u:s3cretpw@db.example.com:5434/pos_load')
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
