import { inject, injectable } from 'tsyringe'
import { ShopSettingsEntity, type ShopSettingsProps } from '../../../../domains/shop-settings.domain'
import { repositoryReadCacheToken, type IRepositoryReadCache } from '../../../shared/ports/repository-read-cache.port'
import type { IShopSettingsRepository } from '../../applications/ports/shop-settings.repository'
import { DrizzleShopSettingsRepository } from './shop-settings.drizzle.repository'

@injectable()
export class CachedShopSettingsRepository implements IShopSettingsRepository {
  constructor(
    @inject(DrizzleShopSettingsRepository) private readonly source: DrizzleShopSettingsRepository,
    @inject(repositoryReadCacheToken) private readonly cache: IRepositoryReadCache,
  ) {}
  get() {
    return this.cache.read('settings', 'shop', 60, () => this.source.get(),
      (settings) => settings.toSnapshot(), (value) => new ShopSettingsEntity(value as ShopSettingsProps))
  }
  getForUpdate() { return this.source.getForUpdate() }
  async save(settings: ShopSettingsEntity) {
    const saved = await this.source.save(settings)
    await this.cache.changed('settings')
    return saved
  }
}
