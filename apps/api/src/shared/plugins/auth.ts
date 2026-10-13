import { jwt } from '@elysiajs/jwt'
import { Elysia, t } from 'elysia'
import { env } from '../../config/env'
import { UsersService } from '../../modules/users/service'
import type { UserRole } from '../../modules/users/schema'
import { forbidden, unauthorized } from '../errors'

export const SESSION_COOKIE = 'session'
export const SESSION_MAX_AGE = 60 * 60 * 12

/**
 * Adds the `auth` route option. `auth: true` requires a signed-in user,
 * `auth: ['owner']` additionally restricts by role. Resolves `user` into context.
 */
export const auth = new Elysia({ name: 'auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: env.jwtSecret,
      exp: `${SESSION_MAX_AGE}s`,
      schema: t.Object({ sub: t.String() }),
    }),
  )
  .macro({
    auth: (roles: UserRole[] | true) => ({
      async resolve({ jwt, cookie }) {
        const token = cookie[SESSION_COOKIE]?.value
        const payload = typeof token === 'string' && (await jwt.verify(token))
        if (!payload) throw unauthorized()

        // Looked up per request so deactivating a user takes effect immediately.
        const user = await UsersService.findActiveById(Number(payload.sub))
        if (!user) throw unauthorized()
        if (roles !== true && !roles.includes(user.role)) throw forbidden()

        return { user }
      },
    }),
  })
