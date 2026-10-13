import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const status = t.Union([t.Literal('open'), t.Literal('paid'), t.Literal('cancelled')])
const method = t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')])

const item = t.Object({
  productId: t.Integer(),
  productName: t.String(),
  sku: t.String(),
  // The price quoted when the item was put on the order; it is what is charged.
  unitPriceSatang: t.Integer(),
  quantity: t.Integer(),
  lineTotalSatang: t.Integer(),
})

export const orderSchemas = {
  order: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    label: t.Nullable(t.String()),
    status,
    openedById: t.Integer(),
    openedByName: t.String(),
    // The sale this order became, once it is paid.
    saleId: t.Nullable(t.Integer()),
    cancelReason: t.Nullable(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
    items: t.Array(item),
    itemCount: t.Integer(),
    subtotalSatang: t.Integer(),
  }),
  open: t.Object({
    label: t.Optional(t.Nullable(t.String({ maxLength: 100 }))),
    items: t.Optional(
      t.Array(t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }) }), {
        maxItems: 100,
      }),
    ),
  }),
  update: t.Object({ label: t.Nullable(t.String({ maxLength: 100 })) }),
  addItem: t.Object({ productId: t.Integer({ minimum: 1 }), quantity: t.Integer({ minimum: 1 }) }),
  setQuantity: t.Object({ quantity: t.Integer({ minimum: 1 }) }),
  cancel: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
  pay: t.Object({
    discountSatang: t.Optional(satang()),
    payments: t.Array(
      t.Object({
        method,
        amountSatang: satang({ minimum: 1 }),
        // The confirmed QR payment backing a `promptpay` payment.
        qrPaymentId: t.Optional(t.Integer({ minimum: 1 })),
      }),
      { minItems: 1 },
    ),
  }),
  listQuery: t.Object({
    status: t.Optional(status),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  itemParams: t.Object({ id: t.Numeric({ minimum: 1 }), productId: t.Numeric({ minimum: 1 }) }),
}

export type OrderResponse = typeof orderSchemas.order.static
