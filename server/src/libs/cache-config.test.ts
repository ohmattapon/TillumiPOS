import { afterEach, describe, expect, test } from 'bun:test'
import { resolveCacheConfig } from './cache-config'

const database = 'postgres://pos:your-password@localhost:5433/pos'
const names = ['REDIS_URL', 'CACHE_KEY_PREFIX', 'CACHE_TIMEOUT_MS'] as const
const saved = Object.fromEntries(names.map((name) => [name, Bun.env[name]]))

const configure = (values: Partial<Record<(typeof names)[number], string>>) => {
  for (const name of names) delete Bun.env[name]
  Object.assign(Bun.env, values)
}

afterEach(() => {
  for (const name of names) {
    if (saved[name] === undefined) delete Bun.env[name]
    else Bun.env[name] = saved[name]
  }
})

describe('resolveCacheConfig', () => {
  test('without a Redis URL there is no cache, with sensible defaults', () => {
    configure({})

    expect(resolveCacheConfig(database)).toEqual({ url: null, prefix: expect.stringMatching(/^pos:[0-9a-f]{16}:cache:v1$/), timeoutMs: 300 })
  })

  test('the default prefix names the installation without its credentials', () => {
    configure({})

    const same = resolveCacheConfig('postgres://other:your-password@localhost:5433/pos').prefix
    const another = resolveCacheConfig('postgres://pos:your-password@localhost:5433/other').prefix

    expect(same).toBe(resolveCacheConfig(database).prefix)
    expect(another).not.toBe(same)
  })

  test('takes the URL, prefix and timeout it is given', () => {
    configure({ REDIS_URL: ' rediss://cache.example.com:6380 ', CACHE_KEY_PREFIX: 'shop:1', CACHE_TIMEOUT_MS: '1000' })

    expect(resolveCacheConfig(database)).toEqual({ url: 'rediss://cache.example.com:6380', prefix: 'shop:1', timeoutMs: 1000 })
  })

  test.each(['not a url', 'http://cache.example.com', 'redis://'])('refuses the Redis URL %p without printing it', (url) => {
    configure({ REDIS_URL: url })

    expect(() => resolveCacheConfig(database)).toThrow('REDIS_URL must be a redis:// or rediss:// URL')
  })

  test('refuses a prefix with characters Redis keys should not carry', () => {
    configure({ CACHE_KEY_PREFIX: 'bad prefix!' })

    expect(() => resolveCacheConfig(database)).toThrow('CACHE_KEY_PREFIX')
  })

  test.each(['10', '9000', 'soon', '300.5'])('refuses a timeout of %p', (timeout) => {
    configure({ CACHE_TIMEOUT_MS: timeout })

    expect(() => resolveCacheConfig(database)).toThrow('CACHE_TIMEOUT_MS')
  })
})
