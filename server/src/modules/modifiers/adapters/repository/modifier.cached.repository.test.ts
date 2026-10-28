import { describe, expect, mock, test } from 'bun:test'
import { makeModifierGroup, makeModifierOption } from '../../../../__tests__/factories'
import type { IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import type { DrizzleModifierRepository } from './modifier.drizzle.repository'
import { CachedModifierRepository } from './modifier.cached.repository'

/** Hands the loaded value through the same serialize and deserialize a real cache would use. */
const roundTrippingCache = (): IRepositoryReadCache => ({
  async read(_group, _key, _ttl, load, serialize, deserialize) {
    return deserialize(JSON.parse(JSON.stringify(serialize(await load() as never))))
  },
  changed: mock(async () => {}),
})

const view = { group: makeModifierGroup(), options: [makeModifierOption()], productIds: [4, 5] }

describe('CachedModifierRepository', () => {
  test('the group list survives the cache with its entities, options and products', async () => {
    const source = { findAllGroups: mock(async () => [view]) } as unknown as DrizzleModifierRepository

    const [cached] = await new CachedModifierRepository(source, roundTrippingCache()).findAllGroups()

    expect(cached!.group.toSnapshot()).toEqual(view.group.toSnapshot())
    expect(cached!.options.map((option) => option.toSnapshot())).toEqual([makeModifierOption().toSnapshot()])
    expect(cached!.productIds).toEqual([4, 5])
  })

  test('a cached entry whose product ids are damaged is refused, so the cache treats it as a miss', async () => {
    const source = { findAllGroups: mock(async () => [{ ...view, productIds: [4, 5.5] }]) } as unknown as DrizzleModifierRepository

    const read = new CachedModifierRepository(source, roundTrippingCache()).findAllGroups()

    await expect(read).rejects.toThrow('Invalid cached product ids')
  })

  test('every write tells the cache the modifiers changed, and returns what the source saved', async () => {
    const group = makeModifierGroup()
    const option = makeModifierOption()
    const source = {
      createGroup: mock(async () => group),
      updateGroup: mock(async () => group),
      createOption: mock(async () => option),
      updateOption: mock(async () => option),
      setProductGroups: mock(async () => {}),
    } as unknown as DrizzleModifierRepository
    const cache = roundTrippingCache()
    const repository = new CachedModifierRepository(source, cache)

    expect(await repository.createGroup(group)).toBe(group)
    expect(await repository.updateGroup(group)).toBe(group)
    expect(await repository.createOption(option)).toBe(option)
    expect(await repository.updateOption(option)).toBe(option)
    await repository.setProductGroups(4, [1])

    expect(cache.changed).toHaveBeenCalledTimes(5)
    expect(cache.changed).toHaveBeenCalledWith('modifiers')
  })

  test('single reads go straight to the source', async () => {
    const source = {
      findGroupView: mock(async () => null),
      findGroupById: mock(async () => null),
      findGroupsByIds: mock(async () => []),
      findOptionById: mock(async () => null),
      findGroupsForProduct: mock(async () => []),
    } as unknown as DrizzleModifierRepository
    const repository = new CachedModifierRepository(source, roundTrippingCache())

    await repository.findGroupView(1)
    await repository.findGroupById(1)
    await repository.findGroupsByIds([1])
    await repository.findOptionById(1)
    await repository.findGroupsForProduct(1)

    expect(source.findGroupView).toHaveBeenCalledWith(1)
    expect(source.findGroupsForProduct).toHaveBeenCalledWith(1)
  })
})
