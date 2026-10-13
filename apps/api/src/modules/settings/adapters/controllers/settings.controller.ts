import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { auth } from '../../../auth.plugin'
import { GetShopSettingsUseCase } from '../../applications/usecases/get-shop-settings.usecase'
import { UpdateShopSettingsUseCase } from '../../applications/usecases/update-shop-settings.usecase'
import { settingsSchemas, type SettingsResponse } from './schemas/settings.schema'

const toResponse = (settings: ShopSettingsEntity): SettingsResponse => settings.toSnapshot()

@injectable()
export class SettingsElysiaController {
  constructor(
    @inject(GetShopSettingsUseCase) private readonly getSettings: GetShopSettingsUseCase,
    @inject(UpdateShopSettingsUseCase) private readonly updateSettings: UpdateShopSettingsUseCase,
  ) {}

  getRoutes() {
    return (
      new Elysia({ name: 'settings', prefix: '/settings', detail: { tags: ['Settings'] } })
        .use(auth)
        // Every signed-in user needs these to format money and name the shop on receipts.
        .get('/', async () => toResponse(await this.getSettings.execute()), {
          auth: true,
          response: settingsSchemas.settings,
          detail: { summary: 'การตั้งค่าร้าน' },
        })
        .patch('/', async ({ body }) => toResponse(await this.updateSettings.execute(body)), {
          auth: ['owner'],
          body: settingsSchemas.update,
          response: settingsSchemas.settings,
          detail: { summary: 'แก้ไขการตั้งค่าร้าน (มีผลกับบิลใหม่เท่านั้น)' },
        })
    )
  }
}
