import { t } from 'elysia'

const fields = {
  name: t.String({ minLength: 1, maxLength: 100 }),
  address: t.Nullable(t.String({ maxLength: 500 })),
  phone: t.Nullable(t.String({ maxLength: 30 })),
  isActive: t.Boolean(),
}

export const branchSchemas = {
  branch: t.Object({ id: t.Integer(), code: t.String(), ...fields }),
  create: t.Object({
    code: t.String({ minLength: 2, maxLength: 10 }),
    name: fields.name,
    address: t.Optional(fields.address),
    phone: t.Optional(fields.phone),
  }),
  update: t.Partial(t.Object(fields)),
}

export type BranchResponse = typeof branchSchemas.branch.static
