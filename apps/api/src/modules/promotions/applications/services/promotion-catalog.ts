import { inject, injectable } from 'tsyringe'
import type { IPromotionCatalog } from '../../../quotes/applications/ports/promotion-catalog.port'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'

/** Answers the quotes module: the promotions that are switched on. */
@injectable()
export class PromotionCatalog implements IPromotionCatalog {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async activePromotions() {
    // A shop has a handful of promotions; one page of the maximum size holds them all.
    return (await this.promotions.find({ isActive: true, limit: 500, offset: 0 })).items
  }
}
