import { inject, injectable } from 'tsyringe'
import { listProductsSchema } from '../schemas/product-schemas'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Query. */
@injectable()
export class ListProductsUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository) {}

  /** Stock levels in the result are those of `branchId`. */
  async execute(input: unknown, branchId: number) {
    return this.products.findAll({ ...listProductsSchema.parse(input), branchId })
  }
}
