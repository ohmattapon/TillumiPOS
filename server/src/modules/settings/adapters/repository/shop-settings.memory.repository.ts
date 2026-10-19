import { injectable } from 'tsyringe'
import {
  DEFAULT_SHOP_SETTINGS,
  ShopSettingsEntity,
  type ShopSettingsProps,
} from '../../../../domains/shop-settings.domain'
import type { IShopSettingsRepository } from '../../applications/ports/shop-settings.repository'

/**
 * No-database settings store: a single row that starts as the defaults,
 * like a shop that has never been configured. The seeder overwrites it.
 */
@injectable()
export class MemoryShopSettingsRepository implements IShopSettingsRepository {
  private settings: ShopSettingsProps | null = null

  async get() {
    return new ShopSettingsEntity(this.settings ?? DEFAULT_SHOP_SETTINGS)
  }

  async getForUpdate() {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin ensures and row-locks the singleton record.
    if (!this.settings) this.settings = { ...DEFAULT_SHOP_SETTINGS }
    return new ShopSettingsEntity(this.settings)
  }

  async save(settings: ShopSettingsEntity) {
    this.settings = settings.toSnapshot()
    return new ShopSettingsEntity(this.settings)
  }
}
