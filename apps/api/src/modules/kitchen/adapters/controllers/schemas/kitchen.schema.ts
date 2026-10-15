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
}

export type KitchenStationResponse = typeof kitchenSchemas.station.static
