import { inject, injectable } from 'tsyringe'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { listPromotionsSchema } from '../schemas/promotion-schemas'

/** Query. */
@injectable()
export class ListPromotionsUseCase {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async execute(input: unknown) {
    return this.promotions.find(listPromotionsSchema.parse(input))
  }
}
