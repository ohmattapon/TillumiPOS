import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import {
  DEFAULT_SHOP_SETTINGS,
  ShopSettingsEntity,
  type ShopSettingsProps,
} from '../../../../domains/shop-settings.domain'
import { shopSettings } from '../../../../infrastructure/database/schema/shop-settings'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShopSettingsRepository } from '../../applications/ports/shop-settings.repository'

const SINGLE_ROW = 1

const columns = {
  shopName: shopSettings.shopName,
  taxId: shopSettings.taxId,
  address: shopSettings.address,
  phone: shopSettings.phone,
  currency: shopSettings.currency,
  vatMode: shopSettings.vatMode,
  vatRateBp: shopSettings.vatRateBp,
  timeZone: shopSettings.timeZone,
  locale: shopSettings.locale,
}

@injectable()
export class DrizzleShopSettingsRepository implements IShopSettingsRepository {
  async get() {
    const [row] = await currentExecutor().select(columns).from(shopSettings).where(eq(shopSettings.id, SINGLE_ROW))
    // locale is stored as plain text; the entity re-validates it on the way out.
    return new ShopSettingsEntity(row ? (row as ShopSettingsProps) : DEFAULT_SHOP_SETTINGS)
  }

  async save(settings: ShopSettingsEntity) {
    const values = settings.toSnapshot()
    const [row] = await currentExecutor()
      .insert(shopSettings)
      .values({ id: SINGLE_ROW, ...values })
      .onConflictDoUpdate({ target: shopSettings.id, set: { ...values, updatedAt: new Date() } })
      .returning(columns)
    return new ShopSettingsEntity(row as ShopSettingsProps)
  }
}
