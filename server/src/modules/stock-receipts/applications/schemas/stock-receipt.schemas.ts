import { z } from 'zod'
import { POSTGRES_INT_MAX } from '../../../../domains/stock-receipt.domain'
export const receiveStockBatchSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive().max(POSTGRES_INT_MAX),
    quantity: z.number().int().positive().max(POSTGRES_INT_MAX),
    // When sent, the quantity counts packs of that pack, not single pieces.
    packId: z.number().int().positive().optional(),
  })).min(1).max(100),
  note: z.string().max(500).optional(),
})
export const receiptIdSchema = z.object({ id: z.coerce.number().int().positive() })
export const receiptListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) })
