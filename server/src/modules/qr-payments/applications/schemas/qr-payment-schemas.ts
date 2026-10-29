import { z } from 'zod'
import { MAX_AMOUNT_SATANG } from '../../../../domains/sale.domain'

export const createQrPaymentSchema = z.object({
  amountSatang: z.number().int().min(1).max(MAX_AMOUNT_SATANG),
  quoteId: z.number().int().positive().optional(),
})

/**
 * What KBank posts when a payment arrives. Only the reference is used, to know which QR to check:
 * the rest is untrusted, so nothing in the body is ever treated as proof of payment. KBank signs
 * nothing on this call (the community SDK validates only the method and content type), so a forged
 * callback changes nothing: the payment is marked paid only if KBank's own inquiry confirms it.
 * Field name follows the QR API vocabulary (partnerTxnUid is the id our create call sent).
 */
export const kbankConfirmationSchema = z
  .object({
    // The route is public: bound what an anonymous caller can make us echo and bind into a query.
    partnerTxnUid: z.string().max(64).optional(),
  })
  .passthrough()

export const createQrPaymentV2Schema = z.object({
  amountSatang: z.number().int().min(1).max(MAX_AMOUNT_SATANG),
  quoteId: z.number().int().positive().optional(),
  shiftId: z.number().int().positive(),
})

export const dismissQrPaymentSchema = z.object({ reason: z.string().trim().min(1).max(500) })

export const qrPageSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
})

export const unclaimedQrPageSchema = qrPageSchema.extend({
  amountSatang: z.number().int().min(1).max(MAX_AMOUNT_SATANG).optional(),
})
