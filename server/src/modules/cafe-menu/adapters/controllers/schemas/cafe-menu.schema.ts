import { t } from 'elysia'

export const cafeMenuSchemas = {
  apply: t.Object({
    itemKeys: t.Array(t.String({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 20 }),
  }),
  applied: t.Object({
    added: t.Object({
      categories: t.Integer(),
      products: t.Integer(),
      groups: t.Integer(),
      options: t.Integer(),
    }),
    reused: t.Object({ categories: t.Integer(), groups: t.Integer() }),
    skipped: t.Object({
      products: t.Integer(),
      items: t.Array(t.Object({ key: t.String(), name: t.String() })),
    }),
  }),
}

export type AppliedCafeMenuResponse = typeof cafeMenuSchemas.applied.static
