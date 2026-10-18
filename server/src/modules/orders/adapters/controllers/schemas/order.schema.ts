import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const status = t.Union([t.Literal('open'), t.Literal('paid'), t.Literal('cancelled'), t.Literal('merged')])
const method = t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')])

// What was chosen, as it was when chosen. The option's cost is internal and not part of the response.
const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

const item = t.Object({
  // Identifies the line: the same product with other options is another line.
  lineId: t.Integer(),
  productId: t.Integer(),
  productName: t.String(),
  sku: t.String(),
  // The price quoted when the item was put on the order, options included; it is what is charged.
  unitPriceSatang: t.Integer(),
  quantity: t.Integer(),
  lineTotalSatang: t.Integer(),
  options: t.Array(lineOption),
  // A generic note on this line, such as "หวานน้อย", when there is one.
  note: t.Nullable(t.String()),
})

const optionIds = t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 }))

const pay = t.Object({
  discountSatang: t.Optional(satang()),
  quoteId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  payments: t.Array(
    t.Object({
      method,
      amountSatang: satang({ minimum: 1 }),
      qrPaymentId: t.Optional(t.Integer({ minimum: 1 })),
    }),
    { minItems: 1 },
  ),
})

export const orderSchemas = {
  order: t.Object({
    memberId: t.Nullable(t.Integer()),
    id: t.Integer(),
    branchId: t.Integer(),
    label: t.Nullable(t.String()),
    // The table the order is on; null for an order without one.
    tableId: t.Nullable(t.Integer()),
    status,
    openedById: t.Integer(),
    openedByName: t.String(),
    // The sale this order became, once it is paid.
    saleId: t.Nullable(t.Integer()),
    cancelReason: t.Nullable(t.String()),
    // The order this one was merged into, when it was merged.
    mergedIntoId: t.Nullable(t.Integer()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    items: t.Array(item),
    itemCount: t.Integer(),
    subtotalSatang: t.Integer(),
  }),
  member: t.Object({ memberId: t.Nullable(t.Integer({ minimum: 1 })) }),
  open: t.Object({
    memberId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
    label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
    tableId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
    items: t.Optional(
      t.Array(
        t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }), options: optionIds }),
        { maxItems: 100 },
      ),
    ),
  }),
  update: t.Object({ label: t.Nullable(t.String({ maxLength: 100 })) }),
  addItem: t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }), options: optionIds }),
  setQuantity: t.Object({ quantity: t.Integer({ minimum: 1 }) }),
  cancel: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
  pay,
  payV2: t.Composite([pay, t.Object({ shiftId: t.Integer({ minimum: 1 }) })]),
  listQuery: t.Object({
    tableId: t.Optional(t.Numeric({ minimum: 1 })),
    excludeId: t.Optional(t.Numeric({ minimum: 1 })),
    status: t.Optional(status),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  itemParams: t.Object({ id: t.Numeric({ minimum: 1 }), productId: t.Numeric({ minimum: 1 }) }),
  move: t.Object({ tableId: t.Nullable(t.Integer({ minimum: 1 })) }),
  merge: t.Object({ sourceOrderId: t.Integer({ minimum: 1 }) }),
  split: t.Object({
    lines: t.Array(t.Object({ lineId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }) }), {
      minItems: 1,
      maxItems: 100,
    }),
    label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
  }),
  lineParams: t.Object({ id: t.Numeric({ minimum: 1 }), lineId: t.Numeric({ minimum: 1 }) }),
  lineNote: t.Object({ note: t.Nullable(t.String({ maxLength: 500 })) }),
}

export type OrderResponse = typeof orderSchemas.order.static
