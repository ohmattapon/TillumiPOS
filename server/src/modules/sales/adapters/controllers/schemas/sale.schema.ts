import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const method = t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')])

const memberInput = t.Optional(t.Nullable(t.Integer({ minimum: 1 })))
const quoteInput = t.Optional(t.Nullable(t.Integer({ minimum: 1 })))
const header = {
  member: t.Nullable(t.Object({ id: t.Integer(), code: t.String(), name: t.String() })),
  // The promotion the sale was given, as it was when sold; null when it had none. A bundle sale
  // carries its group sizes, a coupon sale the code that was typed.
  promotion: t.Nullable(
    t.Object({
      id: t.Integer(),
      name: t.String(),
      kind: t.Union([t.Literal('fixed'), t.Literal('percent'), t.Literal('bundle')]),
      value: t.Integer(),
      maxDiscountSatang: t.Nullable(t.Integer()),
      discountSatang: t.Integer(),
      couponCode: t.Optional(t.String()),
      buyQuantity: t.Optional(t.Integer()),
      freeQuantity: t.Optional(t.Integer()),
    }),
  ),
  id: t.Integer(),
  receiptNo: t.String(),
  status: t.Union([t.Literal('completed'), t.Literal('voided')]),
  subtotalSatang: t.Integer(),
  discountSatang: t.Integer(),
  totalSatang: t.Integer(),
  vatSatang: t.Integer(),
  // How VAT was applied to this sale: whether it is contained in the total or added on top.
  vatMode: t.Union([t.Literal('inclusive'), t.Literal('exclusive'), t.Literal('none')]),
  vatRateBp: t.Integer(),
  branchId: t.Integer(),
  paidSatang: t.Integer(),
  changeSatang: t.Integer(),
  cashierId: t.Integer(),
  cashierName: t.String(),
  // The receipt heading as it was when the sale was made; null on sales recorded before it was kept.
  shopName: t.Nullable(t.String()),
  shopTaxId: t.Nullable(t.String()),
  branchName: t.Nullable(t.String()),
  shopAddress: t.Nullable(t.String()),
  shopPhone: t.Nullable(t.String()),
  voidedAt: t.Nullable(t.Date()),
  voidReason: t.Nullable(t.String()),
  createdAt: t.Date(),
}

// What was chosen, as it was when sold. The cost of an option is internal, like the cost of a line.
const lineOption = t.Object({
  groupId: t.Integer(),
  groupName: t.String(),
  optionId: t.Integer(),
  name: t.String(),
  priceSatang: t.Integer(),
})

const saleItem = t.Object({
  productId: t.Integer(),
  productName: t.String(),
  sku: t.String(),
  // One unit: the product's price plus the options chosen, or the pack's price on a pack line.
  unitPriceSatang: t.Integer(),
  quantity: t.Integer(),
  lineTotalSatang: t.Integer(),
  // The pack sold, if the line is packs; every older line reads as pieces.
  packId: t.Union([t.Integer(), t.Null()]),
  packSize: t.Integer(),
  options: t.Array(lineOption),
})

const itemRequest = t.Object({
  productId: t.Integer(),
  quantity: t.Integer({ minimum: 1 }),
  options: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 40 })),
  // The pack sold; quantity then counts packs.
  packId: t.Optional(t.Integer({ minimum: 1 })),
})

const payment = t.Object({ method, amountSatang: satang({ minimum: 1 }) })
// What a request may carry for a payment: a `promptpay` one is backed by a confirmed QR payment.
const paymentRequest = t.Object({
  method,
  amountSatang: satang({ minimum: 1 }),
  qrPaymentId: t.Optional(t.Integer({ minimum: 1 })),
})

export const saleSchemas = {
  saleHeader: t.Object(header),
  sale: t.Object({
    ...header,
    items: t.Array(saleItem),
    payments: t.Array(payment),
  }),
  saleV2: t.Composite([
    t.Object({ ...header, shiftId: t.Integer() }),
    t.Object({
      items: t.Array(saleItem),
      payments: t.Array(payment),
    }),
  ]),
  create: t.Object({
    memberId: memberInput,
    quoteId: quoteInput,
    items: t.Array(itemRequest, { minItems: 1 }),
    discountSatang: t.Optional(satang()),
    payments: t.Array(paymentRequest, { minItems: 1 }),
  }),
  createV2: t.Object({
    memberId: memberInput,
    quoteId: quoteInput,
    shiftId: t.Integer({ minimum: 1 }),
    ...t.Object({
      items: t.Array(itemRequest, { minItems: 1 }),
      discountSatang: t.Optional(satang()),
      payments: t.Array(paymentRequest, { minItems: 1 }),
    }).properties,
  }),
  void: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
  listQuery: t.Object({
    status: t.Optional(t.Union([t.Literal('completed'), t.Literal('voided')])),
    from: t.Optional(t.Date()),
    to: t.Optional(t.Date()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  summaryQuery: t.Object({ from: t.Date(), to: t.Date() }),
  summary: t.Object({
    saleCount: t.Integer(),
    totalSatang: t.Integer(),
    vatSatang: t.Integer(),
    discountSatang: t.Integer(),
    // Gross profit from the cost snapshot on each line, after bill discounts.
    profitSatang: t.Integer(),
    // Money actually kept per method (cash is net of change given).
    byMethod: t.Array(t.Object({ method, amountSatang: t.Integer() })),
  }),
}

export type SaleResponse = typeof saleSchemas.sale.static
export type SaleV2Response = typeof saleSchemas.saleV2.static
export type SaleHeaderResponse = typeof saleSchemas.saleHeader.static
export type SaleSummaryResponse = typeof saleSchemas.summary.static
