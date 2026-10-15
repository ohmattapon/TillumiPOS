export type CacheGroup = 'categories' | 'products' | 'modifiers' | 'settings'

export interface CacheLookup {
  revision: string
  value: string | null
}

/** Infrastructure read acceleration only; never the authority for business state or permissions. */
export interface IReadCache {
  lookup(group: CacheGroup, key: string): Promise<CacheLookup | null>
  store(group: CacheGroup, key: string, revision: string, value: string, ttlSeconds: number): Promise<void>
  invalidate(group: CacheGroup): Promise<void>
  close(): void
}

export const readCacheToken = Symbol('IReadCache').toString()
