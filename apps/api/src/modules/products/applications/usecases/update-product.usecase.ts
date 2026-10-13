import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { updateProductSchema } from '../schemas/product-schemas'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Command. */
@injectable()
export class UpdateProductUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateProductSchema.parse(input)

    const existing = await this.products.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบสินค้า')

    return this.products.update(existing.with(changes))
  }
}
