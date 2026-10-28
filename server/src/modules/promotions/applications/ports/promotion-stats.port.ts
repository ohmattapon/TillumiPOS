import type { PromotionEntity } from '../../../../domains/promotion.domain'

export interface IPromotionStats {
  /**
   * How many times each of these promotions was used (completed sales plus quotes reserved by a QR),
   * inside the caller's transaction. An id left out has no uses. `isExhausted` is a rule of the entity,
   * so only the count is answered here.
   */
  usageOf(promotionIds: readonly number[]): Promise<Map<number, number>>
}

export const promotionStatsToken = Symbol('IPromotionStats').toString()

/** The promotion beside how many times it was already sold. */
export interface PromotionWithUsage {
  promotion: PromotionEntity
  usedCount: number
  isExhausted: boolean
}
