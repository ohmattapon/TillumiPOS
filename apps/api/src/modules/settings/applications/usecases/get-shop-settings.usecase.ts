import { inject, injectable } from 'tsyringe'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'

/** Query. */
@injectable()
export class GetShopSettingsUseCase {
  constructor(@inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository) {}

  execute() {
    return this.settings.get()
  }
}
