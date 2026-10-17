import { inject, injectable } from 'tsyringe'
import { afterCommit, inTransaction } from '../../../libs/transaction-context'
import { readCacheToken, type CacheGroup, type IReadCache } from '../ports/read-cache.port'
import type { IRepositoryReadCache } from '../ports/repository-read-cache.port'

@injectable()
export class RepositoryReadCache implements IRepositoryReadCache {
  private readonly pending = new Map<string, Promise<unknown>>()
  private readonly epochs = new Map<CacheGroup, number>()

  constructor(@inject(readCacheToken) private readonly cache: IReadCache) {}

  async read<T>(group: CacheGroup, key: string, ttl: number, load: () => Promise<T>,
    serialize: (value: T) => unknown, deserialize: (value: unknown) => T): Promise<T> {
    if (inTransaction()) return load()
    const found = await this.cache.lookup(group, key)
    if (found?.value !== null && found?.value !== undefined) {
      try { return deserialize(JSON.parse(found.value)) } catch {
        // Invalid or older serialized data is a miss; database errors still propagate normally.
      }
    }
    const pendingKey = `${group}:${this.epochs.get(group) ?? 0}:${found?.revision ?? 'uncached'}:${key}`
    const existing = this.pending.get(pendingKey)
    if (existing) return existing as Promise<T>
    const work = (async () => {
      const value = await load()
      if (found) this.fill(group, key, found.revision, () => JSON.stringify(serialize(value)), ttl)
      return value
    })()
    this.pending.set(pendingKey, work)
    try { return await work } finally { this.pending.delete(pendingKey) }
  }

  /**
   * Runs in the background: the answer is already correct from the database, so a slow or failing Redis must
   * not delay it. The store is still conditional on the revision, so a late fill cannot overwrite a newer write.
   */
  private fill(group: CacheGroup, key: string, revision: string, payload: () => string, ttl: number) {
    try {
      this.cache.store(group, key, revision, payload(), ttl).catch(() => {})
    } catch {
      // An unserializable value is simply not cached.
    }
  }

  /** Called only after a successful repository write; rollback discards the queued invalidation. */
  async changed(group: CacheGroup) {
    await afterCommit(`read-cache:${group}`, async () => {
      this.epochs.set(group, (this.epochs.get(group) ?? 0) + 1)
      await this.cache.invalidate(group)
    })
  }
}
