import { t } from 'elysia'

const role = t.Union([t.Literal('owner'), t.Literal('cashier')])
const password = t.String({ minLength: 8, maxLength: 72 })

export const UserModel = {
  user: t.Object({
    id: t.Integer(),
    username: t.String(),
    displayName: t.String(),
    role,
    isActive: t.Boolean(),
  }),
  create: t.Object({
    username: t.String({ minLength: 3, maxLength: 32, pattern: '^[a-zA-Z0-9_.-]+$' }),
    password,
    displayName: t.String({ minLength: 1, maxLength: 100 }),
    role,
  }),
  update: t.Partial(
    t.Object({
      password,
      displayName: t.String({ minLength: 1, maxLength: 100 }),
      role,
      isActive: t.Boolean(),
    }),
  ),
}

export type User = typeof UserModel.user.static
export type CreateUser = typeof UserModel.create.static
export type UpdateUser = typeof UserModel.update.static
