import { jwt } from '@elysiajs/jwt'
import { Elysia, t } from 'elysia'
import { container } from 'tsyringe'
import { DomainError } from '../domains/errors/domain-error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'
import type { UserRole } from '../domains/user-role.vo'
import { env } from '../libs/env'
import { AuthorizeSessionUseCase } from './auth/applications/usecases/authorize-session.usecase'
import { ResolveBranchUseCase } from './branches/applications/usecases/resolve-branch.usecase'

export const SESSION_COOKIE = 'session'
export const SESSION_MAX_AGE = 60 * 60 * 12
/** The branch a request works in. Optional: without it the user's own branch is used. */
export const BRANCH_HEADER = 'x-branch-id'

function parseBranchHeader(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  if (!/^\d{1,9}$/.test(value) || Number(value) < 1)
    throw new DomainError('รหัสสาขาในส่วนหัวคำขอไม่ถูกต้อง', 'INVALID_BRANCH_ID')
  return Number(value)
}

/**
 * Adds the `auth` route option. `auth: true` requires a signed-in user,
 * `auth: ['owner']` additionally restricts by role. Resolves `user` into context, and `branch()`:
 * the branch the request works in, looked up on first use. It is a function so that routes which
 * do not work inside a branch (who am I, the branch list) still answer when the client holds a
 * branch id that has since been closed.
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
      async resolve({ jwt, cookie, headers }) {
        const token = cookie[SESSION_COOKIE]?.value
        const payload = typeof token === 'string' && (await jwt.verify(token))
        if (!payload) throw new DomainUnauthorizedError('กรุณาเข้าสู่ระบบ')

        // Resolved per request: the container is fully wired only after every module has loaded.
        const user = await container.resolve(AuthorizeSessionUseCase).execute(Number(payload.sub), roles)
        const snapshot = { ...user.toSnapshot(), roleId: user.roleId! }

        let branch: ReturnType<ResolveBranchUseCase['execute']> | undefined
        return {
          user: snapshot,
          branch: async () => {
            branch ??= container
              .resolve(ResolveBranchUseCase)
              .execute(snapshot, parseBranchHeader(headers[BRANCH_HEADER]))
            return (await branch).toSnapshot()
          },
        }
      },
    }),
  })
