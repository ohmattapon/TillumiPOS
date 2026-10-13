import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from './auth.plugin'
import { TOKENS } from './tokens'
import type { ICheckoutPolicy } from './shared/ports/checkout-policy.port'

@injectable()
export class CapabilitiesV2Controller {
  constructor(@inject(TOKENS.CheckoutPolicy) private readonly policy: ICheckoutPolicy) {}

  getRoutes() {
    return new Elysia({ name: 'v2.capabilities', prefix: '/capabilities' })
      .use(auth)
      .get('/', async () => ({ checkoutMode: await this.policy.isShiftsEnabled() ? 'shifts' as const : 'legacy' as const }), {
        auth: true,
        response: t.Object({ checkoutMode: t.Union([t.Literal('legacy'), t.Literal('shifts')]) }),
        detail: { summary: 'ความสามารถที่เปิดใช้ใน deployment นี้' },
      })
  }
}
