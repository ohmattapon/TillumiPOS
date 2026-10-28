import { t } from 'elysia'

export const setupSchemas = {
  status: t.Object({ needsSetup: t.Boolean() }),
  complete: t.Object({
    setupCode: t.String({ minLength: 1, maxLength: 64 }),
    shopName: t.String({ minLength: 1, maxLength: 100 }),
    branchName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    username: t.String({ minLength: 1, maxLength: 64 }),
    displayName: t.String({ minLength: 1, maxLength: 100 }),
    password: t.String({ minLength: 10, maxLength: 72 }),
    shopType: t.Optional(t.Union([t.Literal('cafe'), t.Literal('restaurant'), t.Literal('retail'), t.Literal('other')])),
  }),
}
