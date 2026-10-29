import { describe, expect, test } from 'bun:test'
import { assertLocalBaseUrl as bunGuard } from '../../lib/safety'
import { assertLocalBaseUrl as k6Guard } from './local-url'

const accepted = (guard: (url: string) => void, url: string) => {
  try {
    guard(url)
    return true
  } catch {
    return false
  }
}

// Both guards must give the same answer on every one of these.
const SHARED_CASES: [url: string, allowed: boolean][] = [
  ['http://localhost:3190', true],
  ['http://127.0.0.1:3190', true],
  ['http://127.0.0.1', true],
  ['http://localhost/', true],
  ['http://127.0.0.1:3190/api/v1/health', true],
  ['http://LOCALHOST:3190', true],
  ['https://localhost:3190', false],
  ['https://127.0.0.1:3190', false],
  ['http://localhost.evil.com', false],
  ['http://127.0.0.1.evil.com', false],
  ['http://localhost:3190@evil.com', false],
  ['http://127.0.0.1@evil.com', false],
  ['http://evil.com', false],
  ['http://evil.com/localhost', false],
  ['http://[::1]:3190', false],
  ['http://127.0.0.2:3190', false],
  ['http://0.0.0.0:3190', false],
  ['http://10.0.0.5:3190', false],
  ['ftp://localhost', false],
  ['localhost:3190', false],
  ['not a url', false],
  ['', false],
]

// The k6 copy is stricter on purpose where a URL parser would quietly rewrite the address.
const K6_STRICTER: string[] = ['http://user@127.0.0.1:3190', ' http://localhost:3190', 'http://127.0.0.1\@evil.com']

describe('the local base URL guards agree', () => {
  test.each(SHARED_CASES)('%s -> %p', (url, allowed) => {
    expect(accepted(bunGuard, url)).toBe(allowed)
    expect(accepted(k6Guard, url)).toBe(allowed)
  })

  test.each(K6_STRICTER)('the k6 guard refuses %s', (url) => {
    expect(accepted(k6Guard, url)).toBe(false)
  })

  test('the k6 error never repeats the URL', () => {
    expect(() => k6Guard('http://user:s3cretpw@evil.com')).toThrow('local base URL rule')
    try {
      k6Guard('http://user:s3cretpw@evil.com')
    } catch (error) {
      expect(String(error)).not.toContain('s3cretpw')
    }
  })
})
