import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { auth } from '../../../auth.plugin'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { GetShopSettingsUseCase } from '../../applications/usecases/get-shop-settings.usecase'
import { RemoveShopLogoUseCase } from '../../applications/usecases/remove-shop-logo.usecase'
import { SetShopLogoUseCase } from '../../applications/usecases/set-shop-logo.usecase'
import { UpdateShopSettingsUseCase } from '../../applications/usecases/update-shop-settings.usecase'
import { settingsSchemas, type SettingsResponse } from './schemas/settings.schema'

@injectable()
export class SettingsElysiaController {
  constructor(
    @inject(GetShopSettingsUseCase) private readonly getSettings: GetShopSettingsUseCase,
    @inject(UpdateShopSettingsUseCase) private readonly updateSettings: UpdateShopSettingsUseCase,
    @inject(SetShopLogoUseCase) private readonly setLogo: SetShopLogoUseCase,
    @inject(RemoveShopLogoUseCase) private readonly removeLogo: RemoveShopLogoUseCase,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  private toResponse = (settings: ShopSettingsEntity): SettingsResponse => {
    const { logoKey, ...fields } = settings.toSnapshot()
    return { ...fields, logoUrl: logoKey ? this.media.urlFor(logoKey) : null }
  }

  getRoutes() {
    return (
      new Elysia({ name: 'settings', prefix: '/settings', detail: { tags: ['Settings'] } })
        .use(auth)
        // Every signed-in user needs these to format money and name the shop on receipts.
        .get('/', async () => this.toResponse(await this.getSettings.execute()), {
          auth: true,
          response: settingsSchemas.settings,
          detail: { summary: 'การตั้งค่าร้าน' },
        })
        .patch('/', async ({ body, user }) => this.toResponse(await this.updateSettings.execute(body, user)), {
          auth: { can: 'settings.write' },
          body: settingsSchemas.update,
          response: settingsSchemas.settings,
          detail: { summary: 'แก้ไขการตั้งค่าร้าน (มีผลกับบิลใหม่เท่านั้น)' },
        })
        .put('/logo', async ({ body, user }) => this.toResponse(await this.setLogo.execute(body.file, user)), {
          auth: { can: 'settings.write' },
          body: settingsSchemas.logo,
          response: settingsSchemas.settings,
          detail: { summary: 'อัปโหลดโลโก้ใบเสร็จ (JPEG, PNG, WebP ไม่เกิน 2 MB) แทนโลโก้เดิม' },
        })
        .delete('/logo', async ({ user }) => this.toResponse(await this.removeLogo.execute(user)), {
          auth: { can: 'settings.write' },
          response: settingsSchemas.settings,
          detail: { summary: 'ลบโลโก้ใบเสร็จ' },
        })
    )
  }
}
