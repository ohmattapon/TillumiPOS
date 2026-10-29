import { t } from 'elysia'

const note = t.Optional(t.String({ maxLength: 500 }))

export const inventorySchemas = {
  movement: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    productId: t.Integer(),
    type: t.Union([t.Literal('receive'), t.Literal('sale'), t.Literal('void'), t.Literal('adjust')]),
    quantity: t.Integer(),
    balanceAfter: t.Integer(),
    reference: t.Nullable(t.String()),
    note: t.Nullable(t.String()),
    userId: t.Integer(),
    createdAt: t.Date(),
  }),
  receive: t.Object({
    productId: t.Integer(),
    quantity: t.Integer({ minimum: 1 }),
    // When sent, the quantity counts packs of that pack, not single pieces.
    packId: t.Optional(t.Integer({ minimum: 1 })),
    note,
  }),
  // Stock count: the caller states what is physically on the shelf.
  adjust: t.Object({
    productId: t.Integer(),
    countedQty: t.Integer({ minimum: 0 }),
    note,
  }),
  movementsQuery: t.Object({
    productId: t.Optional(t.Numeric()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}

export type StockMovementResponse = typeof inventorySchemas.movement.static
