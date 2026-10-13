import { t } from 'elysia'

const note = t.Optional(t.String({ maxLength: 500 }))

export const InventoryModel = {
  movement: t.Object({
    id: t.Integer(),
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
  }),
}

export type StockMovement = typeof InventoryModel.movement.static
export type ReceiveStock = typeof InventoryModel.receive.static
export type AdjustStock = typeof InventoryModel.adjust.static
export type MovementsQuery = typeof InventoryModel.movementsQuery.static
