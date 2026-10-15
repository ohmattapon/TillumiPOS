import { t } from 'elysia'

const station = t.Object({
  id: t.Integer(),
  name: t.String(),
  sortOrder: t.Integer(),
  isActive: t.Boolean(),
})

export const kitchenSchemas = {
  station,
  createStation: t.Object({
    name: t.String({ minLength: 1, maxLength: 50 }),
    sortOrder: t.Optional(t.Integer()),
  }),
  updateStation: t.Partial(
    t.Object({
      name: t.String({ minLength: 1, maxLength: 50 }),
      sortOrder: t.Integer(),
      isActive: t.Boolean(),
    }),
  ),
  categoryStation: t.Object({ stationId: t.Nullable(t.Integer({ minimum: 1 })) }),
  categoryStationResponse: t.Object({ categoryId: t.Integer(), stationId: t.Nullable(t.Integer()) }),
  ticket: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    orderId: t.Integer(),
    stationId: t.Integer(),
    roundNo: t.Integer(),
    status: t.Union([t.Literal('pending'), t.Literal('done')]),
    sentById: t.Integer(),
    doneById: t.Nullable(t.Integer()),
    doneAt: t.Nullable(t.Date()),
    createdAt: t.Date(),
    lines: t.Array(
      t.Object({
        id: t.Integer(),
        productId: t.Integer(),
        productName: t.String(),
        optionNames: t.Array(t.String()),
        note: t.Nullable(t.String()),
        quantity: t.Integer(),
        voidedQuantity: t.Integer(),
      }),
    ),
  }),
  boardTicket: t.Composite([
    t.Object({
      id: t.Integer(),
      branchId: t.Integer(),
      orderId: t.Integer(),
      stationId: t.Integer(),
      roundNo: t.Integer(),
      status: t.Union([t.Literal('pending'), t.Literal('done')]),
      sentById: t.Integer(),
      doneById: t.Nullable(t.Integer()),
      doneAt: t.Nullable(t.Date()),
      createdAt: t.Date(),
      lines: t.Array(
        t.Object({
          id: t.Integer(),
          productId: t.Integer(),
          productName: t.String(),
          optionNames: t.Array(t.String()),
          note: t.Nullable(t.String()),
          quantity: t.Integer(),
          voidedQuantity: t.Integer(),
        }),
      ),
    }),
    t.Object({ orderLabel: t.Nullable(t.String()), tableName: t.Nullable(t.String()) }),
  ]),
  boardQuery: t.Object({
    stationId: t.Numeric({ minimum: 1 }),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  ticketParams: t.Object({ id: t.Numeric({ minimum: 1 }) }),
}

export type KitchenStationResponse = typeof kitchenSchemas.station.static
