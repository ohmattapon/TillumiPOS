import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readKbankConfig } from './kbank-config'

const KEYS = [
  'KBANK_CONSUMER_ID',
  'KBANK_CONSUMER_SECRET',
  'KBANK_MERCHANT_ID',
  'KBANK_PARTNER_ID',
  'KBANK_PARTNER_SECRET',
  'KBANK_API_BASE_URL',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of KEYS) saved[key] = Bun.env[key]
  for (const key of KEYS.slice(0, 5)) Bun.env[key] = 'test-value'
})

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete Bun.env[key]
    else Bun.env[key] = saved[key]
  }
})

describe('readKbankConfig base URL', () => {
  test('defaults to the https sandbox', () => {
    delete Bun.env.KBANK_API_BASE_URL
    expect(readKbankConfig()?.baseUrl).toBe('https://openapi-sandbox.kasikornbank.com')
  })

  test('accepts https and strips trailing slashes', () => {
    Bun.env.KBANK_API_BASE_URL = 'https://openapi.kasikornbank.com//'
    expect(readKbankConfig()?.baseUrl).toBe('https://openapi.kasikornbank.com')
  })

  test.each(['http://localhost:4010', 'http://127.0.0.1:4010', 'http://[::1]:4010'])(
    'accepts plain http on the local machine (%s)',
    (url) => {
      Bun.env.KBANK_API_BASE_URL = url
      expect(readKbankConfig()?.baseUrl).toBe(url)
    },
  )

  test.each(['http://openapi.kasikornbank.com', 'ftp://example.com', 'not a url'])(
    'refuses %s instead of sending secrets over it',
    (url) => {
      Bun.env.KBANK_API_BASE_URL = url
      expect(() => readKbankConfig()).toThrow('KBANK_API_BASE_URL')
    },
  )

  test('is still null when the credentials are not set', () => {
    delete Bun.env.KBANK_CONSUMER_ID
    Bun.env.KBANK_API_BASE_URL = 'http://openapi.kasikornbank.com'
    expect(readKbankConfig()).toBeNull()
  })
})
