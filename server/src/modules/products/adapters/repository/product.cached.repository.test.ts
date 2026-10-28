import { expect, mock, test } from 'bun:test'
import { makeProduct } from '../../../../__tests__/factories'
import { cacheKey } from '../../../../libs/cache-key'
import type { IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import { CachedProductRepository } from './product.cached.repository'
import type { DrizzleProductRepository } from './product.drizzle.repository'

test('versioned product list keys bypass pre-type snapshots and round-trip both classifications', async () => {
  const normal = makeProduct()
  const cafe = makeProduct({ id: 2, productType: 'cafe' })
  const page = { items: [normal, cafe], total: 2 }
  const source = { findAll: mock(async () => page) } as unknown as DrizzleProductRepository
  const query = { branchId: 1 }
  const { productType: _oldField, ...oldProduct } = normal.toSnapshot()
  const stored = new Map<string, unknown>()
  stored.set(cacheKey(query), { items: [oldProduct], total: 1 })
  const cache: IRepositoryReadCache = {
    async read<T>(_group: string, key: string, _ttl: number, load: () => Promise<T>, serialize: (value: T) => unknown, deserialize: (value: unknown) => T): Promise<T> {
      if (stored.has(key)) return deserialize(stored.get(key))
      const value = await load()
      stored.set(key, serialize(value))
      return value
    },
    changed: mock(async () => {}),
  }
  const repository = new CachedProductRepository(source, cache)
  await repository.findAll(query)
  const cached = await repository.findAll(query)
  expect(cached.items.map(product => product.productType)).toEqual(['normal', 'cafe'])
  expect(cached.total).toBe(2)
  expect(source.findAll).toHaveBeenCalledTimes(1)
  expect(stored.has(`v3:${cacheKey(query)}`)).toBe(true)
  const filteredQuery = { branchId: 1, productType: 'cafe' as const }
  await repository.findAll(filteredQuery)
  expect(source.findAll).toHaveBeenCalledTimes(2)
  expect(stored.has(`v3:${cacheKey(filteredQuery)}`)).toBe(true)
})

test('classification updates still invalidate the products group', async () => {
  const cafe = makeProduct({ productType: 'cafe' })
  const source = { update: mock(async () => cafe) } as unknown as DrizzleProductRepository
  const cache: IRepositoryReadCache = { read: mock(), changed: mock(async () => {}) }
  const repository = new CachedProductRepository(source, cache)
  expect(await repository.update(cafe, 1)).toBe(cafe)
  expect(cache.changed).toHaveBeenCalledWith('products')
})

test('an invalid cached classification is a cache miss, never a silent normal', async () => {
  const page = { items: [makeProduct({ productType: 'cafe' })], total: 1 }
  const source = { findAll: mock(async () => page) } as unknown as DrizzleProductRepository
  const invalid = { ...makeProduct().toSnapshot(), productType: 'other' }
  // Mirrors RepositoryReadCache.read: a value that cannot be deserialized is a miss, so the repository
  // loads from the database instead of trusting or defaulting the bad snapshot.
  const cache: IRepositoryReadCache = {
    async read<T>(_group: string, _key: string, _ttl: number, load: () => Promise<T>, _serialize: (value: T) => unknown, deserialize: (value: unknown) => T): Promise<T> {
      try {
        return deserialize({ items: [invalid], total: 1 })
      } catch {
        return await load()
      }
    },
    changed: mock(async () => {}),
  }
  const repository = new CachedProductRepository(source, cache)
  const result = await repository.findAll({ branchId: 1 })

  expect(result.items.map((product) => product.productType)).toEqual(['cafe'])
  expect(source.findAll).toHaveBeenCalledTimes(1)
})
