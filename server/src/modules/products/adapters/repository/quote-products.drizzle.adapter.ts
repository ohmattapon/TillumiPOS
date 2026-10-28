import { inArray } from 'drizzle-orm'
import { inject, injectable } from 'tsyringe'
import { products } from '../../../../infrastructure/database/schema/products'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IQuoteProducts } from '../../../quotes/applications/ports/quote-products.port'
import { productRepositoryToken, type IProductRepository } from '../../applications/ports/product.repository'

/** Answers the quotes module from the products' own data, so quotes never read our tables. */
@injectable()
export class DrizzleQuoteProducts implements IQuoteProducts {
  constructor(@inject(productRepositoryToken) private readonly repository: IProductRepository) {}

  findById(productId: number, branchId: number) {
    return this.repository.findById(productId, branchId)
  }

  /** One query for the whole cart; an unknown id is simply absent. */
  async categoriesOf(productIds: readonly number[]) {
    if (productIds.length === 0) return new Map<number, number | null>()
    const rows = await currentExecutor()
      .select({ id: products.id, categoryId: products.categoryId })
      .from(products)
      .where(inArray(products.id, [...productIds]))
    return new Map(rows.map((row) => [row.id, row.categoryId]))
  }
}
