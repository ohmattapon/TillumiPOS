export interface CacheConfig {
  url: string | null
  prefix: string
  timeoutMs: number
}

/** No URL means no cache. Configuration mistakes fail startup without revealing credentials. */
export function resolveCacheConfig(databaseUrl: string): CacheConfig {
  const url = Bun.env.REDIS_URL?.trim() || null
  if (url) {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error('REDIS_URL must be a redis:// or rediss:// URL') }
    if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname)
      throw new Error('REDIS_URL must be a redis:// or rediss:// URL')
  }
  const database = new URL(databaseUrl)
  // Credentials are deliberately excluded from the installation identity.
  const identity = new Bun.CryptoHasher('sha256').update(database.host + database.pathname).digest('hex').slice(0, 16)
  const prefix = Bun.env.CACHE_KEY_PREFIX?.trim() || `pos:${identity}:cache:v1`
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix)) throw new Error('CACHE_KEY_PREFIX must contain 1–80 letters, digits, colons, underscores or hyphens')
  const timeoutMs = Number(Bun.env.CACHE_TIMEOUT_MS ?? 300)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 5000)
    throw new Error('CACHE_TIMEOUT_MS must be an integer from 50 to 5000')
  return { url, prefix, timeoutMs }
}
