import { z } from 'zod'
import { PAYMENT_METHODS } from '../../../../domains/sale.domain'

const payment = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountSatang: z.number().int().min(1),
  /** The confirmed QR payment this one is backed by (see the qr-payments module). */
  qrPaymentId: z.number().int().positive().optional(),
})

export const completeSaleSchema = z.object({
  memberId: z.number().int().positive().nullable().optional(),
  quoteId: z.number().int().positive().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        quantity: z.number().int().min(1),
        options: z.array(z.number().int().positive()).max(40).optional(),
      }),
    )
    .min(1),
  discountSatang: z.number().int().min(0).optional(),
  payments: z.array(payment).min(1),
})

export const completeSaleV2Schema = completeSaleSchema.extend({ shiftId: z.number().int().positive() })

export const voidSaleSchema = z.object({ reason: z.string().min(1).max(500) })

export const listSalesSchema = z.object({
  status: z.enum(['completed', 'voided']).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})

export const salesSummarySchema = z.object({ from: z.date(), to: z.date() })
