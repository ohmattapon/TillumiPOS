import { RedisClient } from 'bun'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import type { CacheConfig } from '../../libs/cache-config'
import { RedisReadCache } from '../../modules/shared/adapters/redis-read-cache'

/** A real Redis, as in docker-compose.dev.yml (`bun run db:up`) and the CI service. */
const redisUrl = Bun.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:6379'
const TIMEOUT_MS = 500

let caches: RedisReadCache[] = []
let raw: RedisClient
let prefix: string

const cacheFor = (url: string | null = redisUrl) => {
  const config: CacheConfig = { url, prefix, timeoutMs: TIMEOUT_MS }
  const cache = new RedisReadCache(config)
  caches.push(cache)
  return cache
}

beforeEach(() => {
  prefix = `test:${crypto.randomUUID()}`
  raw = new RedisClient(redisUrl)
})

afterEach(async () => {
  for (const cache of caches) cache.close()
  caches = []
  const keys = (await raw.send('KEYS', [`${prefix}:*`])) as string[]
  if (keys.length > 0) await raw.send('DEL', keys)
  raw.close()
})

describe('RedisReadCache against a real Redis', () => {
  test('a first lookup has a revision and no value', async () => {
    const found = await cacheFor().lookup('products', 'list')

    expect(found).toEqual({ revision: expect.any(String), value: null })
  })

  test('a value stored under the current revision is read back, and expires', async () => {
    const cache = cacheFor()
    const { revision } = (await cache.lookup('products', 'list'))!

    await cache.store('products', 'list', revision, '{"items":[]}', 60)

    expect(await cache.lookup('products', 'list')).toEqual({ revision, value: '{"items":[]}' })
    const [valueKey] = ((await raw.send('KEYS', [`${prefix}:*`])) as string[]).filter((key) => !key.endsWith(':revision'))
    expect(Number(await raw.send('TTL', [valueKey!]))).toBeGreaterThan(0)
  })

  test('a late fill cannot overwrite a newer revision', async () => {
    const cache = cacheFor()
    const { revision } = (await cache.lookup('products', 'list'))!
    await cache.invalidate('products')

    await cache.store('products', 'list', revision, 'stale', 60)

    expect((await cache.lookup('products', 'list'))?.value).toBeNull()
  })

  test('invalidating a group hides what was stored, and leaves the other groups alone', async () => {
    const cache = cacheFor()
    const products = (await cache.lookup('products', 'list'))!
    const categories = (await cache.lookup('categories', 'list'))!
    await cache.store('products', 'list', products.revision, 'p', 60)
    await cache.store('categories', 'list', categories.revision, 'c', 60)

    await cache.invalidate('products')

    expect((await cache.lookup('products', 'list'))?.value).toBeNull()
    expect((await cache.lookup('categories', 'list'))?.value).toBe('c')
  })

  test('a value over one mebibyte is not stored', async () => {
    const cache = cacheFor()
    const { revision } = (await cache.lookup('products', 'big'))!

    await cache.store('products', 'big', revision, 'x'.repeat(1_048_577), 60)

    expect((await cache.lookup('products', 'big'))?.value).toBeNull()
  })

  test('the first connection rotates every group, so a restored database never reads an old value', async () => {
    const first = cacheFor()
    const { revision } = (await first.lookup('settings', 'shop'))!
    await first.store('settings', 'shop', revision, 'old', 60)

    const afterRestart = cacheFor()

    expect((await afterRestart.lookup('settings', 'shop'))?.value).toBeNull()
  })

  test('a closed cache answers nothing and does not reconnect', async () => {
    const cache = cacheFor()
    await cache.lookup('products', 'list')

    cache.close()

    expect(await cache.lookup('products', 'list')).toBeNull()
  })

  test('a command that outlasts the timeout is given up, and the read falls back to the database', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    // The timer is fired at once instead of waiting 500 ms, so the timeout wins the race with Redis.
    const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((run: () => void, ms?: number) => {
      if (ms === TIMEOUT_MS) run()
      return 0
    }) as unknown as typeof setTimeout)
    let warnings = 0
    try {
      expect(await cacheFor().lookup('products', 'list')).toBeNull()
      warnings = warn.mock.calls.length
    } finally {
      timer.mockRestore()
      warn.mockRestore()
    }
    expect(warnings).toBe(1)
  })

  test('without a URL there is no cache', async () => {
    const cache = cacheFor(null)

    expect(await cache.lookup('products', 'list')).toBeNull()
    await cache.store('products', 'list', 'r', 'v', 60)
    await cache.invalidate('products')
  })
})

describe('RedisReadCache when Redis goes away', () => {
  type Link = { upstream?: Awaited<ReturnType<typeof Bun.connect>>; pending: Uint8Array[] }

  /** A TCP hop in front of the real Redis that can be switched off and on, so one URL can fail and then recover. */
  function switchableRedis() {
    const target = new URL(redisUrl)
    const hop = { up: false }
    const server = Bun.listen<Link>({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) {
          if (!hop.up) return void socket.end()
          socket.data = { pending: [] }
          void Bun.connect({
            hostname: target.hostname,
            port: Number(target.port || 6379),
            socket: {
              open(upstream) {
                socket.data.upstream = upstream
                for (const chunk of socket.data.pending) upstream.write(chunk)
                socket.data.pending = []
              },
              data: (_upstream, chunk) => void socket.write(chunk),
              close: () => void socket.end(),
            },
          })
        },
        data(socket, chunk) {
          if (socket.data?.upstream) socket.data.upstream.write(chunk)
          else socket.data?.pending.push(chunk)
        },
        close(socket) { socket.data?.upstream?.end() },
      },
    })
    return { hop, url: `redis://127.0.0.1:${server.port}`, stop: () => server.stop(true) }
  }

  test('reads fall back to the database, the outage is logged once, and the cache comes back later', async () => {
    const proxy = switchableRedis()
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const info = spyOn(console, 'info').mockImplementation(() => {})
    const cache = cacheFor(proxy.url)

    expect(await cache.lookup('products', 'list')).toBeNull()
    expect(await cache.lookup('products', 'list')).toBeNull()
    await cache.store('products', 'list', 'r', 'v', 60)
    await cache.invalidate('products')
    expect(warn).toHaveBeenCalledTimes(1)

    proxy.hop.up = true
    const now = Date.now()
    const clock = spyOn(Date, 'now').mockImplementation(() => now + 11_000)
    try {
      expect(await cache.lookup('products', 'list')).toEqual({ revision: expect.any(String), value: null })
    } finally {
      clock.mockRestore()
    }
    expect(info).toHaveBeenCalledWith('[cache] Redis connected; cached reads enabled')

    warn.mockRestore()
    info.mockRestore()
    proxy.stop()
  })
})
