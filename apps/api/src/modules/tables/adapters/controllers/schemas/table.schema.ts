import { t } from 'elysia'

const fields = {
  name: t.String({ minLength: 1, maxLength: 50 }),
  zone: t.Nullable(t.String({ minLength: 1, maxLength: 50 })),
  seats: t.Integer({ minimum: 1, maximum: 99 }),
  x: t.Integer({ minimum: 0 }),
  y: t.Integer({ minimum: 0 }),
  width: t.Integer({ minimum: 40 }),
  height: t.Integer({ minimum: 40 }),
  sortOrder: t.Integer(),
}

export const tableSchemas = {
  table: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    ...fields,
    isActive: t.Boolean(),
    // Orders open on the table right now, and what they come to.
    openOrders: t.Integer(),
    openTotalSatang: t.Integer(),
  }),
  create: t.Object({
    name: fields.name,
    zone: t.Optional(fields.zone),
    seats: t.Optional(fields.seats),
    x: t.Optional(fields.x),
    y: t.Optional(fields.y),
    width: t.Optional(fields.width),
    height: t.Optional(fields.height),
    sortOrder: t.Optional(fields.sortOrder),
  }),
  update: t.Partial(t.Object({ ...fields, isActive: t.Boolean() })),
}

export type TableResponse = typeof tableSchemas.table.static
