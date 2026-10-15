import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from './auth.plugin'
import type { ICheckoutPolicy } from './shared/ports/checkout-policy.port'
import type { IMediaStorage } from './shared/ports/media-storage.port'
import { TOKENS } from './tokens'

@injectable()
export class CapabilitiesV2Controller {
  constructor(
    @inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'v2.capabilities', prefix: '/capabilities' })
      .use(auth)
      .get(
        '/',
        async () => ({
          checkoutMode: (await this.policy.isShiftsEnabled()) ? ('shifts' as const) : ('legacy' as const),
          imageStorage: this.media.isEnabled() ? ('enabled' as const) : ('disabled' as const),
        }),
        {
          auth: true,
          response: t.Object({
            checkoutMode: t.Union([t.Literal('legacy'), t.Literal('shifts')]),
            imageStorage: t.Union([t.Literal('enabled'), t.Literal('disabled')]),
          }),
          detail: { summary: 'ความสามารถที่เปิดใช้ใน deployment นี้' },
        },
      )
  }
}
