import type { Product } from '@pos/api/types'
import { parseBaht } from '@/lib/money'
import type { CartLine } from '../store/cart.store'

export interface PricedLine {
  product: Product
  quantity: number
  lineTotalSatang: number
  /** More than the shop has: the sale would be refused. */
  exceedsStock: boolean
}

export interface PricedCart {
  lines: PricedLine[]
  itemCount: number
  subtotalSatang: number
  /** The discount that applies: 0 while the field is empty or invalid. */
  discountSatang: number
  isDiscountValid: boolean
  totalSatang: number
  canPay: boolean
}

/**
 * Prices a cart from the current product data. All amounts are integer satang.
 * Lines whose product is no longer sellable are left out rather than charged at a stale price.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
): PricedCart {
  const priced: PricedLine[] = []
  for (const { productId, quantity } of lines) {
    const product = products.get(productId)
    if (!product) continue
    priced.push({
      product,
      quantity,
      lineTotalSatang: product.priceSatang * quantity,
      exceedsStock: product.trackStock && quantity > product.stockQty,
    })
  }

  const subtotalSatang = priced.reduce((sum, line) => sum + line.lineTotalSatang, 0)
  const itemCount = priced.reduce((sum, line) => sum + line.quantity, 0)

  const typed = discountInput.trim() === '' ? 0 : parseBaht(discountInput)
  const isDiscountValid = typed !== null && typed <= subtotalSatang
  const discountSatang = isDiscountValid ? typed : 0
  const totalSatang = subtotalSatang - discountSatang

  return {
    lines: priced,
    itemCount,
    subtotalSatang,
    discountSatang,
    isDiscountValid,
    totalSatang,
    canPay: priced.length > 0 && isDiscountValid && totalSatang > 0 && !priced.some((line) => line.exceedsStock),
  }
}
