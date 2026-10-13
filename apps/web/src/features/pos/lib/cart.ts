import type { Order, Product } from '@pos/api/types'
import { calculateTotals, type VatMode } from '@pos/api/pricing'
import type { CartLine } from '../store/cart.store'

export interface PricedLine {
  productId: number
  name: string
  unitPriceSatang: number
  quantity: number
  lineTotalSatang: number
  /** More than the shop has: the sale would be refused. */
  exceedsStock: boolean
  /** What is on the shelf, for the message shown when the line asks for more. */
  stockQty: number
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

const exceeds = (product: Product | undefined, quantity: number) =>
  product !== undefined && product.trackStock && quantity > product.stockQty

/**
 * Prices a cart from the current product data. All amounts are integers in the minor unit, and the
 * totals come from the same function the server uses, so the screen never disagrees with the receipt.
 * Lines whose product is no longer sellable are left out rather than charged at a stale price.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  options: PricingOptions,
): PricedCart {
  const priced: PricedLine[] = []
  for (const { productId, quantity } of lines) {
    const product = products.get(productId)
    if (!product) continue
    priced.push({
      productId,
      name: product.name,
      unitPriceSatang: product.priceSatang,
      quantity,
      lineTotalSatang: product.priceSatang * quantity,
      exceedsStock: exceeds(product, quantity),
      stockQty: product.stockQty,
    })
  }
  return summarize(priced, discountInput, options)
}

/**
 * Prices an open order. Its lines carry the price quoted when each was added, and that is what is
 * charged, whatever the menu says now. The catalogue is only consulted to warn about stock.
 */
export function priceOrder(
  items: Order['items'],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  options: PricingOptions,
): PricedCart {
  const priced: PricedLine[] = items.map((item) => {
    const product = products.get(item.productId)
    return {
      productId: item.productId,
      name: item.productName,
      unitPriceSatang: item.unitPriceSatang,
      quantity: item.quantity,
      lineTotalSatang: item.unitPriceSatang * item.quantity,
      exceedsStock: exceeds(product, item.quantity),
      stockQty: product?.stockQty ?? 0,
    }
  })
  return summarize(priced, discountInput, options)
}

function summarize(
  priced: PricedLine[],
  discountInput: string,
  { vatMode, vatRateBp, parseAmount }: PricingOptions,
): PricedCart {
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
