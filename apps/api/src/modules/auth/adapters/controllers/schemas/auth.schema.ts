import { t } from 'elysia'

export const authSchemas = {
  login: t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 1 }),
  }),
  loggedOut: t.Object({ ok: t.Boolean() }),
}
