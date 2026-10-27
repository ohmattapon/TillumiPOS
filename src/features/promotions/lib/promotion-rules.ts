import type { PromotionCandidate } from '@pos/api/promotions'
import type { Promotion } from '../api'

/**
 * The rules a promotion evaluation reads. The API does not carry the coupon, bundle and limit fields yet
 * (Task 2 adds them), and the rules require them, so a missing field is read as null. No promotion the API
 * can return is a bundle or a coupon before that, so the nulls never change an evaluation.
 */
export function promotionRulesOf(promotion: Promotion): PromotionCandidate {
  return {
    ...promotion,
    couponCode: promotion.couponCode ?? null,
    buyQuantity: promotion.buyQuantity ?? null,
    freeQuantity: promotion.freeQuantity ?? null,
    maxUses: promotion.maxUses ?? null,
    maxUsesPerMember: promotion.maxUsesPerMember ?? null,
  }
}

/** A whole page of promotions, in the shape the rules take. */
export function promotionRulesOfAll(promotions: readonly Promotion[]): PromotionCandidate[] {
  return promotions.map(promotionRulesOf)
}
