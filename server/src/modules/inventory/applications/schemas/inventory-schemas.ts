import { z } from 'zod'

const note = z.string().max(500).optional()

export const receiveStockSchema = z.object({
  productId: z.number().int(),
  quantity: z.number().int().min(1),
  // When sent, the quantity counts packs of that pack, not single pieces.
  packId: z.number().int().positive().optional(),
  note,
})

// Stock count: the caller states what is physically on the shelf.
export const adjustStockSchema = z.object({
  productId: z.number().int(),
  countedQty: z.number().int().min(0),
  note,
})

export const listStockMovementsSchema = z.object({
  productId: z.number().int().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
})
