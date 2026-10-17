import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const payment = t.Object({
  id: t.Integer(),
  branchId: t.Integer(),
  // Reference 1 the bank was given.
  reference: t.String(),
  amountSatang: t.Integer(),
  status: t.Union([t.Literal('pending'), t.Literal('paid'), t.Literal('cancelled')]),
  expiresAt: t.Date(),
  // Only what the bank itself reported.
  bankTransactionId: t.Nullable(t.String()),
  payerName: t.Nullable(t.String()),
  paidAt: t.Nullable(t.Date()),
  // The sale this payment was used for, once it has been.
  saleId: t.Nullable(t.Integer()),
  createdAt: t.Date(),
})

export const qrPaymentSchemas = {
  payment,
  created: t.Composite([payment, t.Object({ qrRawData: t.String(), qrImage: t.String() })]),
  create: t.Object({ amountSatang: satang({ minimum: 1 }), quoteId: t.Optional(t.Integer({ minimum: 1 })) }),
  config: t.Object({ enabled: t.Boolean() }),
  // SCB posts many fields; only the reference is read, and the rest is deliberately not trusted.
  scbConfirmation: t.Object(
    { billPaymentRef1: t.Optional(t.String()), transactionId: t.Optional(t.String()) },
    { additionalProperties: true },
  ),
  scbAcknowledgement: t.Object({
    resCode: t.String(),
    resDesc: t.String(),
    transactionId: t.String(),
  }),
}

export type QrPaymentResponse = typeof qrPaymentSchemas.payment.static
