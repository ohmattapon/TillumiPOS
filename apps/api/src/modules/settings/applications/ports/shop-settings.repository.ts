import type { ShopSettingsEntity } from '../../../../domains/shop-settings.domain'

export interface IShopSettingsRepository {
  /** The shop's settings, or the defaults when it has never been configured. Never null. */
  get(): Promise<ShopSettingsEntity>
  /** Ensures and row-locks the singleton settings record in the caller's unit of work. */
  getForUpdate(): Promise<ShopSettingsEntity>
  /** Stores the settings, replacing the previous ones. */
  save(settings: ShopSettingsEntity): Promise<ShopSettingsEntity>
}

const shopSettingsRepositoryTokenSymbol: unique symbol = Symbol('IShopSettingsRepository')
export const shopSettingsRepositoryToken = shopSettingsRepositoryTokenSymbol.toString()
