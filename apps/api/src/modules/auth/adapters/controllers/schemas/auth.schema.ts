import { t } from 'elysia'
import { userSchemas } from '../../../../users/adapters/controllers/schemas/user.schema'

export const authSchemas = {
  me: t.Composite([userSchemas.user, t.Object({ roleName: t.String(), permissions: t.Array(t.String()) })]),
  login: t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 1 }),
  }),
  loggedOut: t.Object({ ok: t.Boolean() }),
}
