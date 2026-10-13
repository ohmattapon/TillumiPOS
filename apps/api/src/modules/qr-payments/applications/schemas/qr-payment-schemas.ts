import { z } from 'zod'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'

export const createQrPaymentSchema = z.object({
  amountSatang: z.number().int().min(1).max(MAX_AMOUNT_SATANG),
})

/**
 * What SCB posts when a payment arrives. Only the reference is used, to know which QR to check:
 * the rest is untrusted, so nothing in the body is ever treated as proof of payment.
 */
export const scbConfirmationSchema = z
  .object({
    billPaymentRef1: z.string().optional(),
    transactionId: z.string().optional(),
  })
  .passthrough()

export const createQrPaymentV2Schema = z.object({
  amountSatang: z.number().int().min(1).max(MAX_AMOUNT_SATANG),
  shiftId: z.number().int().positive(),
})

export const dismissQrPaymentSchema = z.object({ reason: z.string().trim().min(1).max(500) })

export const qrPageSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})
