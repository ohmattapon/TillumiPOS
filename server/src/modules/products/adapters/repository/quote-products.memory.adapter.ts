import { injectable } from 'tsyringe'
import type { IQuoteProducts } from '../../../quotes/applications/ports/quote-products.port'
import { MemoryProductRepository } from './product.memory.repository'

/**
 * Answers the quotes module from the products' own memory store, so quotes
 * never read our tables. The demo composition root must hand this the same
 * MemoryProductRepository singleton the product token gets.
 */
@injectable()
export class MemoryQuoteProducts implements IQuoteProducts {
  constructor(private readonly products: MemoryProductRepository) {}

  findById(productId: number, branchId: number) {
    return this.products.findById(productId, branchId)
  }

  categoriesOf(productIds: readonly number[]) {
    return this.products.categoriesOf(productIds)
  }
}
