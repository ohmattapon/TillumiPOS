import { t } from 'elysia'
const fields = { name: t.String({ minLength: 1, maxLength: 60 }), permissions: t.Array(t.String(), { maxItems: 60 }) }
export const roleSchemas = {
  role: t.Object({ id: t.Integer(), ...fields, systemKey: t.Union([t.Literal('owner'), t.Literal('cashier'), t.Null()]), userCount: t.Integer({ minimum: 0 }) }),
  create: t.Object(fields), update: t.Partial(t.Object(fields)),
  listQuery: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })), offset: t.Optional(t.Numeric({ minimum: 0 })) }),
}
