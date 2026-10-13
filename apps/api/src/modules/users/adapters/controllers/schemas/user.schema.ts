import { t } from 'elysia'

const role = t.Union([t.Literal('owner'), t.Literal('cashier')])
const password = t.String({ minLength: 8, maxLength: 72 })

export const userSchemas = {
  user: t.Object({
    id: t.Integer(),
    username: t.String(),
    displayName: t.String(),
    role,
    branchId: t.Integer(),
    isActive: t.Boolean(),
  }),
  create: t.Object({
    username: t.String({ minLength: 3, maxLength: 32, pattern: '^[a-zA-Z0-9_.-]+$' }),
    password,
    displayName: t.String({ minLength: 1, maxLength: 100 }),
    role,
    // Defaults to the branch the owner is working in.
    branchId: t.Optional(t.Integer({ minimum: 1 })),
  }),
  update: t.Partial(
    t.Object({
      password,
      displayName: t.String({ minLength: 1, maxLength: 100 }),
      role,
      branchId: t.Integer({ minimum: 1 }),
      isActive: t.Boolean(),
    }),
  ),
}

export type UserResponse = typeof userSchemas.user.static
