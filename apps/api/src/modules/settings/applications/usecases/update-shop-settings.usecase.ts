import { inject, injectable } from 'tsyringe'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'
import { shiftSettingsGuardToken } from '../../../shifts/applications/ports/shift-settings-guard.port'
import type { IShiftSettingsGuard } from '../../../shifts/applications/ports/shift-settings-guard.port'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { updateShopSettingsSchema } from '../schemas/settings-schemas'

/** Command: changes the given settings. Sales already made keep the VAT they were priced with. */
@injectable()
export class UpdateShopSettingsUseCase {
  constructor(
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(shiftSettingsGuardToken) private readonly shiftGuard: IShiftSettingsGuard,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
  ) {}

  async execute(input: unknown) {
    const changes = updateShopSettingsSchema.parse(input)

    return this.uow.run(async () => {
      const current = await this.settings.getForUpdate()
      if (changes.currency !== undefined && changes.currency !== current.currency)
        await this.shiftGuard.assertCurrencyChangeAllowed()
      return this.settings.save(current.with(changes))
    })
  }
}
