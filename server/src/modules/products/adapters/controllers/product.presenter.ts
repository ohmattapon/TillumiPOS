import type { ProductEntity } from '../../../../domains/product.domain'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import type { ProductResponse } from './schemas/product.schema'

/** The API exposes a ready-to-use image URL; the storage key stays internal. */
export function toProductResponse(product: ProductEntity, media: IMediaStorage): ProductResponse {
  const { imageKey, ...fields } = product.toSnapshot()
  return { ...fields, packs: product.packs.map((pack) => ({ ...pack })), imageUrl: imageKey ? media.urlFor(imageKey) : null }
}
