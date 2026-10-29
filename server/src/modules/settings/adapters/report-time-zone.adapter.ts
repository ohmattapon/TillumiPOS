import { inject, injectable } from 'tsyringe'
import type { IReportTimeZone } from '../../sales/applications/ports/report-time-zone.port'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../applications/ports/shop-settings.repository'

/**
 * Answers the sales module's report time zone port from the shop's single settings row.
 * Provider side: the port is owned by sales, implemented and bound here.
 */
@injectable()
export class SettingsReportTimeZone implements IReportTimeZone {
  constructor(@inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository) {}

  async timeZone(): Promise<string> {
    return (await this.settings.get()).timeZone
  }
}
