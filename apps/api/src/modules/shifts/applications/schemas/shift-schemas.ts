import { z } from 'zod'

export const createRegisterSchema = z.object({
  code: z.string().regex(/^[A-Z0-9-]{1,20}$/),
  name: z.string().min(1).max(100),
})

export const updateRegisterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0)

export const openShiftSchema = z.object({
  registerId: z.number().int().positive(),
  openingCashSatang: z.number().int().min(0).max(2_147_483_647),
  openingNote: z.string().max(500).nullable().optional(),
})

export const closeShiftSchema = z.object({
  closingRevision: z.number().int().positive(),
  countedCashSatang: z.number().int().min(0).max(2_147_483_647),
  reason: z.string().max(500).optional(),
})

/** Counting may start over QRs that are still waiting to be paid only when the person counting says they know. */
export const startClosingSchema = z.object({ acknowledgePendingQr: z.boolean().optional() })

export const shiftRevisionSchema = z.object({ closingRevision: z.number().int().positive() })

export const cashMovementSchema = z.object({
  kind: z.enum(['cash_in', 'cash_out']),
  amountSatang: z.number().int().positive().max(2_147_483_647),
  reason: z.string().trim().min(1).max(500),
})

export const shiftListSchema = z.object({
  registerId: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'closing', 'closed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const cashEntryListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
