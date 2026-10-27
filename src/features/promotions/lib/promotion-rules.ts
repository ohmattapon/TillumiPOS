import type { PromotionCandidate } from '@pos/api/promotions'
import type { Promotion } from '../api'

/**
 * The rules a promotion evaluation reads, with the API's display fields (name, image URL, timestamps) left
 * in; the candidate type allows both shapes.
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
