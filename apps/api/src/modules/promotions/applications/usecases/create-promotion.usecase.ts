import { inject, injectable } from 'tsyringe'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'
import { createPromotionSchema } from '../schemas/promotion-schemas'

/** Command. */
@injectable()
export class CreatePromotionUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
  ) {}

  async execute(input: unknown, actor: { role: string }) {
    const dto = createPromotionSchema.parse(input)
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านจัดการโปรโมชันได้', 'FORBIDDEN')
    const now = this.clock.now()
    return this.promotions.create(
      new PromotionEntity({
        id: 0,
        name: dto.name,
        kind: dto.kind,
        value: dto.value,
        maxDiscountSatang: dto.maxDiscountSatang ?? null,
        minSubtotalSatang: dto.minSubtotalSatang ?? 0,
        startsOn: dto.startsOn ?? null,
        endsOn: dto.endsOn ?? null,
        weekdays: dto.weekdays ?? null,
        windowStartMinute: dto.windowStartMinute ?? null,
        windowEndMinute: dto.windowEndMinute ?? null,
        audience: dto.audience ?? 'everyone',
        isActive: dto.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }
}
