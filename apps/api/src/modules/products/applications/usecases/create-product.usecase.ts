import { inject, injectable } from 'tsyringe'
import { ProductEntity } from '../../../../domains/product.domain'
import { createProductSchema } from '../schemas/product-schemas'
import { productRepositoryToken } from '../ports/product.repository'
import type { IProductRepository } from '../ports/product.repository'

/** Command. */
@injectable()
export class CreateProductUseCase {
  constructor(@inject(productRepositoryToken) private readonly products: IProductRepository) {}

  async execute(input: unknown) {
    const dto = createProductSchema.parse(input)

    return this.products.create(
      new ProductEntity({
        id: 0,
        sku: dto.sku,
        barcode: dto.barcode ?? null,
        name: dto.name,
        categoryId: dto.categoryId ?? null,
        priceSatang: dto.priceSatang,
        costSatang: dto.costSatang ?? 0,
        trackStock: dto.trackStock ?? true,
        // New products start empty; stock arrives through the inventory module.
        stockQty: 0,
        isActive: true,
        imageKey: null,
      }),
    )
  }
}
