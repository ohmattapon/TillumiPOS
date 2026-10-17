import { Elysia, type Cookie } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { env } from '../../../../libs/env'
import { auth, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../auth.plugin'
import { userSchemas } from '../../../users/adapters/controllers/schemas/user.schema'
import { SetOwnPinUseCase } from '../../applications/usecases/set-own-pin.usecase'
import { LoginUseCase } from '../../applications/usecases/login.usecase'
import { ListSwitchableUsersUseCase } from '../../applications/usecases/list-switchable-users.usecase'
import { SwitchUserUseCase } from '../../applications/usecases/switch-user.usecase'
import { authSchemas } from './schemas/auth.schema'

@injectable()
export class AuthElysiaController {
  constructor(
    @inject(LoginUseCase) private readonly login: LoginUseCase,
    @inject(SetOwnPinUseCase) private readonly setOwnPin: SetOwnPinUseCase,
    @inject(ListSwitchableUsersUseCase) private readonly listSwitchable: ListSwitchableUsersUseCase,
    @inject(SwitchUserUseCase) private readonly switchUser: SwitchUserUseCase,
  ) {}

  /** The session is an HTTP concern: a signed, http-only cookie carrying only the user id. */
  private async startSession(
    user: { id: number },
    jwt: { sign: (payload: { sub: string }) => Promise<string> },
    cookie: Record<string, Cookie<unknown>>,
  ) {
    cookie[SESSION_COOKIE]!.set({
      value: await jwt.sign({ sub: String(user.id) }),
      httpOnly: true,
      sameSite: 'lax',
      secure: env.cookieSecure,
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }

  getRoutes() {
    return new Elysia({ name: 'auth-module', prefix: '/auth', detail: { tags: ['Auth'] } })
      .use(auth)
      .post(
        '/login',
        async ({ body, jwt, cookie }) => {
          const user = await this.login.execute(body)
          await this.startSession(user, jwt, cookie)
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
      .get(
        '/switch-users',
        async () => {
          const items = await this.listSwitchable.execute()
          return { items, total: items.length }
        },
        { auth: true, response: authSchemas.switchUsers, detail: { summary: 'ผู้ใช้ที่สลับเข้ามาขายด้วย PIN ได้' } },
      )
      .post(
        '/switch',
        async ({ body, user, jwt, cookie }) => {
          // The cookie is set only after the use case accepts the PIN, so a wrong PIN keeps the old session.
          const target = await this.switchUser.execute(body, user)
          await this.startSession(target, jwt, cookie)
          return { ...target.toSnapshot(), roleId: target.roleId! }
        },
        {
          auth: true,
          body: authSchemas.switchUser,
          response: userSchemas.user,
          detail: { summary: 'สลับผู้ขายที่จุดขายด้วย PIN เริ่มเซสชันของผู้ใช้นั้น' },
        },
      )
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
