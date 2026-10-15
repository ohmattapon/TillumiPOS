import { z } from 'zod'
import { PROMOTION_AUDIENCES, PROMOTION_KINDS } from '../../../../domains/promotion.domain'

const minute = z.number().int().min(0).max(1439)
const fields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PROMOTION_KINDS),
  value: z.number().int().min(1),
  maxDiscountSatang: z.number().int().min(1).nullable(),
  minSubtotalSatang: z.number().int().min(0),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  windowStartMinute: minute.nullable(),
  windowEndMinute: minute.nullable(),
  audience: z.enum(PROMOTION_AUDIENCES),
  isActive: z.boolean(),
}

export const createPromotionSchema = z.object({
  name: fields.name,
  kind: fields.kind,
  value: fields.value,
  maxDiscountSatang: fields.maxDiscountSatang.optional(),
  minSubtotalSatang: fields.minSubtotalSatang.optional(),
  startsOn: fields.startsOn.optional(),
  endsOn: fields.endsOn.optional(),
  weekdays: fields.weekdays.optional(),
  windowStartMinute: fields.windowStartMinute.optional(),
  windowEndMinute: fields.windowEndMinute.optional(),
  audience: fields.audience.optional(),
  isActive: fields.isActive.optional(),
})

export const updatePromotionSchema = z.object({
  name: fields.name.optional(),
  kind: fields.kind.optional(),
  value: fields.value.optional(),
  maxDiscountSatang: fields.maxDiscountSatang.optional(),
  minSubtotalSatang: fields.minSubtotalSatang.optional(),
  startsOn: fields.startsOn.optional(),
  endsOn: fields.endsOn.optional(),
  weekdays: fields.weekdays.optional(),
  windowStartMinute: fields.windowStartMinute.optional(),
  windowEndMinute: fields.windowEndMinute.optional(),
  audience: fields.audience.optional(),
  isActive: fields.isActive.optional(),
})

export const promotionIdSchema = z.object({ id: z.number().int().positive() })

export const listPromotionsSchema = z.object({
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
})
