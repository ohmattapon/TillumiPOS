import type { ProductEntity } from '../../../../domains/product.domain'

/** The products a quote prices. Owned here, answered by the products module. */
export interface IQuoteProducts {
  /** The product as the branch sells it, with its stock there; null when there is none. */
  findById(productId: number, branchId: number): Promise<ProductEntity | null>
  /** The category of each product, for promotions limited to categories; a product with none maps to null. */
  categoriesOf(productIds: readonly number[]): Promise<Map<number, number | null>>
}

const quoteProductsTokenSymbol: unique symbol = Symbol('IQuoteProducts')
export const quoteProductsToken = quoteProductsTokenSymbol.toString()
