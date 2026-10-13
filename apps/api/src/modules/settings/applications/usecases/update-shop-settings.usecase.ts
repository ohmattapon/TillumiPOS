import { inject, injectable } from 'tsyringe'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'
import { updateShopSettingsSchema } from '../schemas/settings-schemas'

/** Command: changes the given settings. Sales already made keep the VAT they were priced with. */
@injectable()
export class UpdateShopSettingsUseCase {
  constructor(@inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository) {}

  async execute(input: unknown) {
    const changes = updateShopSettingsSchema.parse(input)

    const current = await this.settings.get()
    return this.settings.save(current.with(changes))
  }
}
