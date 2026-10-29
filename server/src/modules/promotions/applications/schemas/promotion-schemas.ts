import { z } from 'zod'
import { MAX_BUNDLE_QUANTITY, MAX_SCOPE_IDS, PROMOTION_AUDIENCES, PROMOTION_KINDS } from '../../../../domains/promotion.domain'

const minute = z.number().int().min(0).max(1439)
const ids = z.array(z.number().int().positive()).max(MAX_SCOPE_IDS)
const fields = {
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PROMOTION_KINDS),
  // A bundle always carries 0; every other kind is checked by the entity, which knows the per-kind bounds.
  value: z.number().int().min(0),
  buyQuantity: z.number().int().min(1).max(MAX_BUNDLE_QUANTITY),
  freeQuantity: z.number().int().min(1).max(MAX_BUNDLE_QUANTITY),
  couponCode: z.string().trim().min(1).max(100),
  maxUses: z.number().int().min(1),
  maxUsesPerMember: z.number().int().min(1),
  maxDiscountSatang: z.number().int().min(1).nullable(),
  minSubtotalSatang: z.number().int().min(0),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  windowStartMinute: minute.nullable(),
  windowEndMinute: minute.nullable(),
  audience: z.enum(PROMOTION_AUDIENCES),
  isActive: z.boolean(),
  scope: z.object({ productIds: ids, categoryIds: ids }).nullable(),
}

/** The optional coupon, bundle and limit bounderies; each name covers creating and clearing with null. */
const newRules = {
  couponCode: fields.couponCode.nullable(),
  buyQuantity: fields.buyQuantity.nullable(),
  freeQuantity: fields.freeQuantity.nullable(),
  maxUses: fields.maxUses.nullable(),
  maxUsesPerMember: fields.maxUsesPerMember.nullable(),
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
  scope: fields.scope.optional(),
  couponCode: newRules.couponCode.optional(),
  buyQuantity: newRules.buyQuantity.optional(),
  freeQuantity: newRules.freeQuantity.optional(),
  maxUses: newRules.maxUses.optional(),
  maxUsesPerMember: newRules.maxUsesPerMember.optional(),
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
  scope: fields.scope.optional(),
  couponCode: newRules.couponCode.optional(),
  buyQuantity: newRules.buyQuantity.optional(),
  freeQuantity: newRules.freeQuantity.optional(),
  maxUses: newRules.maxUses.optional(),
  maxUsesPerMember: newRules.maxUsesPerMember.optional(),
})

export const promotionIdSchema = z.object({ id: z.number().int().positive() })

export const listPromotionsSchema = z.object({
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
})
