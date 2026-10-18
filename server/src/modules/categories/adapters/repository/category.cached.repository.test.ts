import { describe, expect, mock, test } from 'bun:test'
import { makeCategory } from '../../../../__tests__/factories'
import type { IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import { CachedCategoryRepository } from './category.cached.repository'
import type { DrizzleCategoryRepository } from './category.drizzle.repository'

/** Hands the loaded value through the same serialize and deserialize a real cache would use. */
const roundTrippingCache = (): IRepositoryReadCache => ({
  async read(_group, _key, _ttl, load, serialize, deserialize) {
    return deserialize(JSON.parse(JSON.stringify(serialize(await load() as never))))
  },
  changed: mock(async () => {}),
})

describe('CachedCategoryRepository', () => {
  test('the list survives the cache as entities', async () => {
    const source = { findAll: mock(async () => [makeCategory({ id: 1, name: 'ชา' }), makeCategory({ id: 2, name: 'กาแฟ' })]) } as unknown as DrizzleCategoryRepository

    const listed = await new CachedCategoryRepository(source, roundTrippingCache()).findAll()

    expect(listed.map((category) => category.toSnapshot())).toEqual([
      makeCategory({ id: 1, name: 'ชา' }).toSnapshot(),
      makeCategory({ id: 2, name: 'กาแฟ' }).toSnapshot(),
    ])
  })

  test('a single read goes straight to the source, and a write tells the cache the categories changed', async () => {
    const category = makeCategory()
    const source = {
      findById: mock(async () => category),
      create: mock(async () => category),
      update: mock(async () => category),
    } as unknown as DrizzleCategoryRepository
    const cache = roundTrippingCache()
    const repository = new CachedCategoryRepository(source, cache)

    expect(await repository.findById(1)).toBe(category)
    expect(await repository.create(category)).toBe(category)
    expect(await repository.update(category)).toBe(category)

    expect(cache.changed).toHaveBeenCalledTimes(2)
    expect(cache.changed).toHaveBeenCalledWith('categories')
  })
})
