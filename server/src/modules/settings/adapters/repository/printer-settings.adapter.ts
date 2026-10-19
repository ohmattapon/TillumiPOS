import { inject, injectable } from 'tsyringe'
import {
  type IPrinterSettings,
  type PrinterSettings,
} from '../../../receipt-printer/applications/ports/printer-settings.port'
import { shopSettingsRepositoryToken } from '../../applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../applications/ports/shop-settings.repository'

/**
 * Answers the receipt-printer module's settings port from the shop's single settings row.
 * Provider side: the port is owned by receipt-printer, implemented and bound here.
 */
@injectable()
export class ShopPrinterSettings implements IPrinterSettings {
  constructor(@inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository) {}

  async current(): Promise<PrinterSettings> {
    const shop = await this.settings.get()
    return {
      host: shop.receiptPrinterIp,
      port: shop.receiptPrinterPort,
      enabled: shop.receiptPrinterEnabled,
      drawerEnabled: shop.cashDrawerEnabled,
    }
  }
}
