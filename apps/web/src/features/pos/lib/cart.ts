import type { Product } from '@pos/api/types'
import { calculateTotals, type VatMode } from '@pos/api/pricing'
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
  /** VAT charged on this cart, whether included in the total or added on top. */
  vatSatang: number
  /** What the customer owes: exactly what the server will charge. */
  totalSatang: number
  canPay: boolean
}

export interface PricingOptions {
  vatMode: VatMode
  vatRateBp: number
  /** Reads the discount the cashier typed into minor units; null when it is not a valid amount. */
  parseAmount: (input: string) => number | null
}

/**
 * Prices a cart from the current product data. All amounts are integers in the minor unit, and the
 * totals come from the same function the server uses, so the screen never disagrees with the receipt.
 * Lines whose product is no longer sellable are left out rather than charged at a stale price.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  { vatMode, vatRateBp, parseAmount }: PricingOptions,
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

  const typed = discountInput.trim() === '' ? 0 : parseAmount(discountInput)
  const isDiscountValid = typed !== null && typed <= subtotalSatang
  const discountSatang = isDiscountValid ? typed : 0
  const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode, vatRateBp })

  return {
    lines: priced,
    itemCount,
    subtotalSatang,
    discountSatang,
    isDiscountValid,
    vatSatang,
    totalSatang,
    canPay: priced.length > 0 && isDiscountValid && totalSatang > 0 && !priced.some((line) => line.exceedsStock),
  }
}
