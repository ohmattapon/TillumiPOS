import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { promotionRepositoryToken, type IPromotionRepository } from '../ports/promotion.repository'

const EXTENSION_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Command: stores a new image under a fresh key, then drops the one it replaces. */
@injectable()
export class SetPromotionImageUseCase {
  constructor(
    @inject(promotionRepositoryToken) private readonly promotions: IPromotionRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  async execute(id: number, file: Blob) {
    const extension = EXTENSION_BY_TYPE[file.type]
    if (!extension) throw new DomainError('ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP', 'INVALID_FILE_TYPE')

    // Checked before uploading, so a request for an unknown promotion stores nothing.
    const existing = await this.promotions.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบโปรโมชัน', 'PROMOTION_NOT_FOUND')

    // A new key per upload lets browsers and the edge cache images forever.
    const key = ['promotions', id, crypto.randomUUID() + '.' + extension].join('/')
    await this.media.put(key, file)
    const updated = await this.promotions.setImageKey(id, key)

    // Best effort: a leftover object is harmless, so a failed cleanup must not fail the request.
    if (existing.imageKey) await this.media.delete(existing.imageKey).catch(() => {})
    return updated
  }
}
