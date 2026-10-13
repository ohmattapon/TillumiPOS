import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const method = t.Union([t.Literal('cash'), t.Literal('promptpay'), t.Literal('card')])

const header = {
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
  voidedAt: t.Nullable(t.Date()),
  voidReason: t.Nullable(t.String()),
  createdAt: t.Date(),
}

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
    items: t.Array(
      t.Object({
        productId: t.Integer(),
        productName: t.String(),
        sku: t.String(),
        unitPriceSatang: t.Integer(),
        quantity: t.Integer(),
        lineTotalSatang: t.Integer(),
      }),
    ),
    payments: t.Array(payment),
  }),
  create: t.Object({
    items: t.Array(t.Object({ productId: t.Integer(), quantity: t.Integer({ minimum: 1 }) }), { minItems: 1 }),
    discountSatang: t.Optional(satang()),
    payments: t.Array(paymentRequest, { minItems: 1 }),
  }),
  void: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
  listQuery: t.Object({
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
export type SaleHeaderResponse = typeof saleSchemas.saleHeader.static
export type SaleSummaryResponse = typeof saleSchemas.summary.static
