import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IClock } from '../../../shared/ports/clock.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { promotionIdSchema, updatePromotionSchema } from '../schemas/promotion-schemas'

/** Command: edits or switches a promotion on or off. Quotes and sales keep their own snapshot. */
@injectable()
export class UpdatePromotionUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(id: number, input: unknown, actor: Actor) {
    promotionIdSchema.parse({ id })
    const dto = updatePromotionSchema.parse(input)
    requirePermission(actor, 'promotions.write', 'เฉพาะเจ้าของร้านจัดการโปรโมชันได้')
    return this.unitOfWork.run(async () => {
      const promotion = await this.promotions.findByIdForUpdate(id)
      if (!promotion) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')
      return this.promotions.update(promotion.with(dto, this.clock.now()))
    })
  }
}
