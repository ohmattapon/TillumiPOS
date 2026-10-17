import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { OrderedProduct } from '../../../../domains/order.domain'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'

/**
 * The product as it is being ordered right now: its name and price are what the order will quote.
 * A product that is no longer for sale cannot be put on an order. Stock is not checked here; it
 * is checked, and taken, when the order is paid.
 */
export async function findOrderedProduct(
  products: IProductRepository,
  productId: number,
  branchId: number,
): Promise<OrderedProduct> {
  const product = await products.findById(productId, branchId)
  if (!product) throw new DomainNotFoundError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
  product.assertActive()
  return { productId: product.id, productName: product.name, sku: product.sku, unitPriceSatang: product.priceSatang }
}
