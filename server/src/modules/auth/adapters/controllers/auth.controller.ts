import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { env } from '../../../../libs/env'
import { auth, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../auth.plugin'
import { userSchemas } from '../../../users/adapters/controllers/schemas/user.schema'
import { SetOwnPinUseCase } from '../../applications/usecases/set-own-pin.usecase'
import { LoginUseCase } from '../../applications/usecases/login.usecase'
import { authSchemas } from './schemas/auth.schema'

@injectable()
export class AuthElysiaController {
  constructor(
    @inject(LoginUseCase) private readonly login: LoginUseCase,
    @inject(SetOwnPinUseCase) private readonly setOwnPin: SetOwnPinUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'auth-module', prefix: '/auth', detail: { tags: ['Auth'] } })
      .use(auth)
      .post(
        '/login',
        async ({ body, jwt, cookie }) => {
          const user = await this.login.execute(body)

          // The session is an HTTP concern: a signed, http-only cookie carrying only the user id.
          cookie[SESSION_COOKIE]!.set({
            value: await jwt.sign({ sub: String(user.id) }),
            httpOnly: true,
            sameSite: 'lax',
            secure: env.cookieSecure,
            path: '/',
            maxAge: SESSION_MAX_AGE,
          })
          return { ...user.toSnapshot(), roleId: user.roleId! }
        },
        { body: authSchemas.login, response: userSchemas.user, detail: { summary: 'เข้าสู่ระบบ' } },
      )
      .post(
        '/logout',
        ({ cookie }) => {
          cookie[SESSION_COOKIE]!.remove()
          return { ok: true }
        },
        { response: authSchemas.loggedOut, detail: { summary: 'ออกจากระบบ' } },
      )
      .get('/me', ({ user }) => user, {
        auth: true,
        response: authSchemas.me,
        detail: { summary: 'ข้อมูลผู้ใช้ที่เข้าสู่ระบบอยู่' },
      })
      .put(
        '/me/pin',
        async ({ body, user }) => {
          const updated = await this.setOwnPin.execute(body, user)
          return { ...updated.toSnapshot(), roleId: updated.roleId! }
        },
        {
          auth: true,
          body: authSchemas.setOwnPin,
          response: userSchemas.user,
          detail: { summary: 'ตั้งหรือลบ PIN ของตนเอง ต้องยืนยันด้วยรหัสผ่านปัจจุบัน' },
        },
      )
  }
}
