import { RedisClient } from 'bun'
import type { CacheConfig } from '../../../libs/cache-config'
import type { CacheGroup, CacheLookup, IReadCache } from '../ports/read-cache.port'

const GROUPS: CacheGroup[] = ['categories', 'products', 'modifiers', 'settings']
const RETRY_DELAY_MS = 10_000
const LOOKUP = `
local revision = redis.call('GET', KEYS[1])
if not revision then
  revision = ARGV[1]
  redis.call('SET', KEYS[1], revision)
end
local value = false
if redis.call('HGET', KEYS[2], 'revision') == revision then
  value = redis.call('HGET', KEYS[2], 'value')
end
return {revision, value}
`
const WRITE_IF_CURRENT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('HSET', KEYS[2], 'revision', ARGV[1], 'value', ARGV[2])
  return redis.call('EXPIRE', KEYS[2], ARGV[3])
end
return false
`

/** Bounded, optional Redis cache. A cache failure never becomes a failed database write. */
export class RedisReadCache implements IReadCache {
  private client: RedisClient | null = null
  private ready: Promise<RedisClient> | null = null
  private blockedUntil = 0
  private recovering = false
  private stopped = false

  constructor(private readonly config: CacheConfig) {}

  // Each group's metadata and values share a hash slot on Redis Cluster too.
  private revisionKey(group: CacheGroup) { return `${this.config.prefix}:{${group}}:revision` }
  private valueKey(group: CacheGroup, key: string) {
    const hash = new Bun.CryptoHasher('sha256').update(key).digest('hex')
    return `${this.config.prefix}:{${group}}:${hash}`
  }

  private connect(): Promise<RedisClient> {
    if (!this.ready) {
      const client = new RedisClient(this.config.url!, {
        connectionTimeout: this.config.timeoutMs,
        autoReconnect: false,
        enableOfflineQueue: false,
      })
      this.client = client
      this.ready = client.connect().then(async () => {
        // A restore can replace PostgreSQL while Redis stays alive. Rotate on first connection too.
        await Promise.all(GROUPS.map((group) => client.set(this.revisionKey(group), crypto.randomUUID())))
        if (this.recovering) {
          this.recovering = false
          console.info('[cache] Redis connected; cached reads enabled')
        }
        return client
      })
    }
    return this.ready
  }

  private async run<T>(action: (client: RedisClient) => Promise<T>): Promise<T | null> {
    if (!this.config.url || this.stopped || Date.now() < this.blockedUntil) return null
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        this.connect().then(action),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Cache timeout')), this.config.timeoutMs)
        }),
      ])
    } catch {
      if (!this.recovering) console.warn('[cache] Redis unavailable; cached reads will use PostgreSQL')
      this.recovering = true
      this.blockedUntil = Date.now() + RETRY_DELAY_MS
      this.client?.close()
      this.client = null
      this.ready = null
      return null
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  async lookup(group: CacheGroup, key: string): Promise<CacheLookup | null> {
    return this.run(async (client) => {
      // One atomic operation both initializes metadata and reads only the current revision.
      const result = await client.send('EVAL', [
        LOOKUP, '2', this.revisionKey(group), this.valueKey(group, key), crypto.randomUUID(),
      ])
      if (!Array.isArray(result) || typeof result[0] !== 'string') return null
      return { revision: result[0], value: typeof result[1] === 'string' ? result[1] : null }
    })
  }

  async store(group: CacheGroup, key: string, revision: string, value: string, ttlSeconds: number) {
    if (Buffer.byteLength(value) > 1_048_576) return
    await this.run((client) => client.send('EVAL', [
      WRITE_IF_CURRENT, '2', this.revisionKey(group), this.valueKey(group, key),
      revision, value, String(ttlSeconds),
    ]))
  }

  async invalidate(group: CacheGroup) {
    await this.run((client) => client.set(this.revisionKey(group), crypto.randomUUID()))
  }

  close() {
    this.stopped = true
    this.client?.close()
    this.client = null
    this.ready = null
  }
}
