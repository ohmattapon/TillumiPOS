import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { env } from '../../../../libs/env'
import { auth, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../auth.plugin'
import { userSchemas } from '../../../users/adapters/controllers/schemas/user.schema'
import { CompleteSetupUseCase } from '../../applications/usecases/complete-setup.usecase'
import { GetSetupStatusUseCase } from '../../applications/usecases/get-setup-status.usecase'
import { setupSchemas } from './schemas/setup.schema'

@injectable()
export class SetupElysiaController {
  constructor(
    @inject(GetSetupStatusUseCase) private readonly status: GetSetupStatusUseCase,
    @inject(CompleteSetupUseCase) private readonly complete: CompleteSetupUseCase,
  ) {}

  /** Open to anyone, on purpose: it is only for a shop with nobody in it, and the code guards the write. */
  getRoutes() {
    return new Elysia({ name: 'setup', prefix: '/setup', detail: { tags: ['Setup'] } })
      .use(auth)
      .get('/', () => this.status.execute(), {
        response: setupSchemas.status,
        detail: { summary: 'ร้านนี้ต้องตั้งค่าครั้งแรกหรือไม่' },
      })
      .post(
        '/',
        async ({ body, jwt, cookie }) => {
          const owner = await this.complete.execute(body)

          // Signs the new owner in, the same session the login route starts.
          cookie[SESSION_COOKIE]!.set({
            value: await jwt.sign({ sub: String(owner.id) }),
            httpOnly: true,
            sameSite: 'lax',
            secure: env.cookieSecure,
            path: '/',
            maxAge: SESSION_MAX_AGE,
          })
          return owner.toSnapshot()
        },
        {
          body: setupSchemas.complete,
          response: userSchemas.user,
          detail: { summary: 'ตั้งค่าร้านครั้งแรก: สร้างเจ้าของด้วยรหัสตั้งค่าจาก log' },
        },
      )
  }
}
