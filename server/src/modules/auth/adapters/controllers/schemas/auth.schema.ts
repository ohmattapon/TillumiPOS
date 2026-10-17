import { t } from 'elysia'
import { page } from '../../../../../libs/http-schemas'
import { userSchemas } from '../../../../users/adapters/controllers/schemas/user.schema'

export const authSchemas = {
  me: t.Composite([userSchemas.user, t.Object({ roleName: t.String(), permissions: t.Array(t.String()) })]),
  login: t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 1 }),
  }),
  setOwnPin: t.Object({ currentPassword: t.String(), pin: t.Union([t.String(), t.Null()]) }),
  loggedOut: t.Object({ ok: t.Boolean() }),
  switchUsers: page(t.Object({ id: t.Integer(), displayName: t.String() })),
  switchUser: t.Object({ userId: t.Integer({ minimum: 1 }), pin: t.String({ minLength: 1, maxLength: 20 }) }),
}
