import { jwt } from '@elysiajs/jwt'
import { Elysia, t } from 'elysia'
import { container } from 'tsyringe'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'
import type { UserRole } from '../domains/user-role.vo'
import { env } from '../libs/env'
import { AuthorizeSessionUseCase } from './auth/applications/usecases/authorize-session.usecase'

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
        if (!payload) throw new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')

        // Resolved per request: the container is fully wired only after every module has loaded.
        const user = await container.resolve(AuthorizeSessionUseCase).execute(Number(payload.sub), roles)
        return { user: user.toSnapshot() }
      },
    }),
  })
