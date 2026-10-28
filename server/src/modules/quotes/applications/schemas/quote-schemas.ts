import { z } from 'zod'
import { COUPON_CODE_PATTERN, normalizeCouponCode } from '../../../../domains/promotion.domain'

const line = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1),
  options: z.array(z.number().int().positive()).max(40).optional(),
  packId: z.number().int().positive().optional(),
})

export const createQuoteSchema = z
  .object({
    lines: z.array(line).min(1).max(100).optional(),
    memberId: z.number().int().positive().nullable().optional(),
    orderId: z.number().int().positive().optional(),
    couponCode: z
      .string()
      .max(40)
      .transform((code) => normalizeCouponCode(code))
      .refine((code) => COUPON_CODE_PATTERN.test(code), { message: 'รูปแบบโค้ดคูปองไม่ถูกต้อง' })
      .optional(),
    redeemPoints: z.number().int().min(0).optional(),
  })
  .refine((value) => (value.orderId !== undefined) !== (value.lines !== undefined), {
    message: 'ต้องระบุรายการสินค้า (lines) หรือออเดอร์ (orderId) อย่างใดอย่างหนึ่ง',
  })
  .refine((value) => value.orderId === undefined || value.memberId === undefined, {
    message: 'ออเดอร์มีสมาชิกของตัวเองอยู่แล้ว ไม่ต้องระบุ memberId',
  })

export const quoteIdSchema = z.object({ id: z.number().int().positive() })
