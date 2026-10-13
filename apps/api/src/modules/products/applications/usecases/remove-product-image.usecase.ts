import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Command. */
@injectable()
export class RemoveProductImageUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  async execute(id: number, branchId: number) {
    const existing = await this.products.findById(id, branchId)
    if (!existing) throw new DomainNotFoundError('ไม่พบสินค้า')

    const updated = await this.products.setImageKey(id, null, branchId)
    // Best effort, as when replacing an image.
    if (existing.imageKey) await this.media.delete(existing.imageKey).catch(() => {})
    return updated
  }
}
