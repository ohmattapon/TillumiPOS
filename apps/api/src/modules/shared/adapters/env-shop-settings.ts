import { injectable } from 'tsyringe'
import { env } from '../../../libs/env'
import type { IShopSettings } from '../ports/shop-settings.port'

@injectable()
export class EnvShopSettings implements IShopSettings {
  readonly vatRateBp = env.vatRateBp
  readonly timeZone = env.timeZone
}
