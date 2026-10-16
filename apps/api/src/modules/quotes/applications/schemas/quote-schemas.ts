import { z } from 'zod'

const line = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  options: z.array(z.number().int().positive()).max(40).optional(),
})

export const createQuoteSchema = z
  .object({
    lines: z.array(line).min(1).max(100).optional(),
    memberId: z.number().int().positive().nullable().optional(),
    orderId: z.number().int().positive().optional(),
  })
  .refine((value) => (value.orderId !== undefined) !== (value.lines !== undefined), {
    message: 'ต้องระบุรายการสินค้า (lines) หรือออเดอร์ (orderId) อย่างใดอย่างหนึ่ง',
  })
  .refine((value) => value.orderId === undefined || value.memberId === undefined, {
    message: 'ออเดอร์มีสมาชิกของตัวเองอยู่แล้ว ไม่ต้องระบุ memberId',
  })

export const quoteIdSchema = z.object({ id: z.number().int().positive() })
