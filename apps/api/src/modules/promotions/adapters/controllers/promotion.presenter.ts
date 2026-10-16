import type { PromotionEntity } from '../../../../domains/promotion.domain'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { snapshotOf } from '../promotion.snapshot'
import type { PromotionResponse } from './schemas/promotion.schema'

/** The API exposes a ready-to-use image URL; the storage key stays internal. */
export function toPromotionResponse(promotion: PromotionEntity, media: IMediaStorage): PromotionResponse {
  const { imageKey, ...fields } = snapshotOf(promotion)
  return { ...fields, imageUrl: imageKey ? media.urlFor(imageKey) : null }
}
