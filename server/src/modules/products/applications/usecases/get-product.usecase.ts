import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Query. */
@injectable()
export class GetProductUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository) {}

  async execute(id: number, branchId: number) {
    const product = await this.products.findById(id, branchId)
    if (!product) throw new DomainNotFoundError('ไม่พบสินค้า')
    return product
  }
}
