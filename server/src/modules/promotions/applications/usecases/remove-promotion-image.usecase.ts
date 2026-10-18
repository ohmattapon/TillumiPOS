import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'

/** Command. */
@injectable()
export class RemovePromotionImageUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  async execute(id: number) {
    const existing = await this.promotions.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')

    const updated = await this.promotions.setImageKey(id, null)
    // Best effort, as when replacing an image.
    if (existing.imageKey) await this.media.delete(existing.imageKey).catch(() => {})
    return updated
  }
}
