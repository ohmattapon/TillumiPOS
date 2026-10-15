import type { CacheGroup } from './read-cache.port'

/** Read acceleration and commit-aware invalidation, shared through a port across modules. */
export interface IRepositoryReadCache {
  read<T>(group: CacheGroup, key: string, ttl: number, load: () => Promise<T>,
    serialize: (value: T) => unknown, deserialize: (value: unknown) => T): Promise<T>
  changed(group: CacheGroup): Promise<void>
}

export const repositoryReadCacheToken = Symbol('IRepositoryReadCache').toString()
