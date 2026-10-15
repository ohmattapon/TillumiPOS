import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { promotionIdSchema } from '../schemas/promotion-schemas'

/** Query. */
@injectable()
export class GetPromotionUseCase {
  constructor(@inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository) {}

  async execute(input: unknown) {
    const { id } = promotionIdSchema.parse(input)
    const promotion = await this.promotions.findById(id)
    if (!promotion) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
    return promotion
  }
}
