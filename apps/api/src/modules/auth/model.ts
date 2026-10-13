import { t } from 'elysia'

export const AuthModel = {
  login: t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 1 }),
  }),
}
