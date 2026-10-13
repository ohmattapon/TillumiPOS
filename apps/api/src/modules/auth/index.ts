import { Elysia, t } from 'elysia'
import { env } from '../../libs/env'
import { unauthorized } from '../../shared/errors'
import { auth as authPlugin, SESSION_COOKIE, SESSION_MAX_AGE } from '../../shared/plugins/auth'
import { UserModel } from '../users/model'
import { UsersService } from '../users/service'
import { AuthModel } from './model'

export const auth = new Elysia({ name: 'auth-module', prefix: '/auth', detail: { tags: ['Auth'] } })
  .use(authPlugin)
  .post(
    '/login',
    async ({ body, jwt, cookie }) => {
      const user = await UsersService.verifyCredentials(body.username, body.password)
      if (!user) throw unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')

      cookie[SESSION_COOKIE]!.set({
        value: await jwt.sign({ sub: String(user.id) }),
        httpOnly: true,
        sameSite: 'lax',
        secure: env.cookieSecure,
        path: '/',
        maxAge: SESSION_MAX_AGE,
      })
      return user
    },
    { body: AuthModel.login, response: UserModel.user, detail: { summary: 'เข้าสู่ระบบ' } },
  )
  .post(
    '/logout',
    ({ cookie }) => {
      cookie[SESSION_COOKIE]!.remove()
      return { ok: true }
    },
    { response: t.Object({ ok: t.Boolean() }), detail: { summary: 'ออกจากระบบ' } },
  )
  .get('/me', ({ user }) => user, {
    auth: true,
    response: UserModel.user,
    detail: { summary: 'ข้อมูลผู้ใช้ที่เข้าสู่ระบบอยู่' },
  })
