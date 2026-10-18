import type { ProductEntity } from '../../../../domains/product.domain'

/** The products a quote prices. Owned here, answered by the products module. */
export interface IQuoteProducts {
  /** The product as the branch sells it, with its stock there; null when there is none. */
  findById(productId: number, branchId: number): Promise<ProductEntity | null>
}

const quoteProductsTokenSymbol: unique symbol = Symbol('IQuoteProducts')
export const quoteProductsToken = quoteProductsTokenSymbol.toString()
