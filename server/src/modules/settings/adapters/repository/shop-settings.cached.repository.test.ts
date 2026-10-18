import { describe, expect, mock, test } from 'bun:test'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import type { IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import { CachedShopSettingsRepository } from './shop-settings.cached.repository'
import type { DrizzleShopSettingsRepository } from './shop-settings.drizzle.repository'

/** Hands the loaded value through the same serialize and deserialize a real cache would use. */
const roundTrippingCache = (): IRepositoryReadCache => ({
  async read(_group, _key, _ttl, load, serialize, deserialize) {
    return deserialize(JSON.parse(JSON.stringify(serialize(await load() as never))))
  },
  changed: mock(async () => {}),
})

const settings = new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, shopName: 'ร้านสมชาย' })

describe('CachedShopSettingsRepository', () => {
  test('the settings survive the cache as an entity', async () => {
    const source = { get: mock(async () => settings) } as unknown as DrizzleShopSettingsRepository

    const read = await new CachedShopSettingsRepository(source, roundTrippingCache()).get()

    expect(read).toBeInstanceOf(ShopSettingsEntity)
    expect(read.toSnapshot()).toEqual(settings.toSnapshot())
  })

  test('the locked read bypasses the cache, and saving tells the cache the settings changed', async () => {
    const source = {
      getForUpdate: mock(async () => settings),
      save: mock(async () => settings),
    } as unknown as DrizzleShopSettingsRepository
    const cache = roundTrippingCache()
    const repository = new CachedShopSettingsRepository(source, cache)

    expect(await repository.getForUpdate()).toBe(settings)
    expect(await repository.save(settings)).toBe(settings)

    expect(cache.changed).toHaveBeenCalledWith('settings')
  })
})
