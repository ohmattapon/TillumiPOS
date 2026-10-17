import type { PromotionEntity } from '../../../../domains/promotion.domain'

/** The promotions a quote may choose from. The promotions module answers it. */
export interface IPromotionCatalog {
  /** Every promotion that is switched on. The quote decides which ones apply right now. */
  activePromotions(): Promise<PromotionEntity[]>
}

const token: unique symbol = Symbol('IPromotionCatalog')
export const promotionCatalogToken = token.toString()
