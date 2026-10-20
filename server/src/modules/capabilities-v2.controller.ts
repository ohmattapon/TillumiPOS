import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from './auth.plugin'
import { GetCapabilitiesUseCase } from './shared/applications/get-capabilities.usecase'

@injectable()
export class CapabilitiesV2Controller {
  constructor(@inject(GetCapabilitiesUseCase) private readonly getCapabilities: GetCapabilitiesUseCase) {}

  getRoutes() {
    return new Elysia({ name: 'v2.capabilities', prefix: '/capabilities' })
      .use(auth)
      .get(
        '/',
        () => this.getCapabilities.execute(),
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
