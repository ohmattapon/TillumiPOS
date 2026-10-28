import { t } from 'elysia'

const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

export const quoteSchemas = {
  quote: t.Object({
    id: t.Integer(),
    branchId: t.Integer(),
    memberId: t.Nullable(t.Integer()),
    member: t.Nullable(t.Object({ id: t.Integer(), code: t.String(), name: t.String() })),
    orderId: t.Nullable(t.Integer()),
    lines: t.Array(
      t.Object({
        productId: t.Integer(),
        productName: t.String(),
        sku: t.String(),
        unitPriceSatang: t.Integer(),
        quantity: t.Integer(),
        options: t.Array(lineOption),
        packId: t.Nullable(t.Integer()),
        packSize: t.Integer(),
      }),
    ),
    subtotalSatang: t.Integer(),
    promotion: t.Nullable(
      t.Object({
        id: t.Integer(),
        name: t.String(),
        kind: t.Union([t.Literal('fixed'), t.Literal('percent')]),
        value: t.Integer(),
        maxDiscountSatang: t.Nullable(t.Integer()),
        discountSatang: t.Integer(),
      }),
    ),
    discountSatang: t.Integer(),
    pointsRedeemed: t.Integer(),
    pointsDiscountSatang: t.Integer(),
    vatMode: t.Union([t.Literal('inclusive'), t.Literal('exclusive'), t.Literal('none')]),
    vatRateBp: t.Integer(),
    vatSatang: t.Integer(),
    totalSatang: t.Integer(),
    status: t.Union([t.Literal('open'), t.Literal('reserved'), t.Literal('consumed'), t.Literal('cancelled')]),
    expiresAt: t.Date(),
    createdAt: t.Date(),
  }),
  create: t.Object({
    lines: t.Optional(
      t.Array(
        t.Object({
          productId: t.Integer({ minimum: 1 }),
          quantity: t.Integer({ minimum: 1 }),
          options: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 })),
          packId: t.Optional(t.Integer({ minimum: 1 })),
        }),
        { minItems: 1, maxItems: 100 },
      ),
    ),
    memberId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
    orderId: t.Optional(t.Integer({ minimum: 1 })),
    redeemPoints: t.Optional(t.Integer({ minimum: 0 })),
  }),
}
export type QuoteResponse = typeof quoteSchemas.quote.static
