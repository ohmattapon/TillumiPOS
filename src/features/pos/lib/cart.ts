import type { Order, Product } from '@pos/api/types'
import { packUnitPriceSatang } from '@pos/api/packs'
import { calculateTotals, type VatMode } from '@pos/api/pricing'
import type { CartLine } from '../store/cart.store'

export interface PricedLine {
  /** Names the line to the cart actions: the cart's own key, or the order line's id. */
  lineKey: string
  /** The id of the order line; null for a line in the local cart. */
  lineId: number | null
  productId: number
  name: string
  /** One unit, the options included. */
  unitPriceSatang: number
  quantity: number
  lineTotalSatang: number
  options: { name: string; priceSatang: number }[]
  /** The ids of the options chosen; what a sale or an order is sent. */
  optionIds: number[]
  /** The pack sold, or null for single units. */
  packId: number | null
  /** Units in one of this line's quantity: 1 for single units. */
  packSize: number
  /** More than the shop has: the sale would be refused. The stock is the product's, shared by its lines. */
  exceedsStock: boolean
  /** What is on the shelf, for the message shown when the line asks for more. */
  stockQty: number
  /** An option on the line cannot be chosen any more, so the line cannot be sold as it is. */
  unavailable: boolean
  /** Units the kitchen already has. Always 0 for a line that is not on an order yet. */
  sentQuantity: number
  /** What the cashier wrote for the kitchen; null for a line that is not on an order yet. */
  note: string | null
}

export interface PricedCart {
  lines: PricedLine[]
  itemCount: number
  subtotalSatang: number
  /** The discount that applies: 0 while the field is empty or invalid. */
  discountSatang: number
  isDiscountValid: boolean
  /** The promotion that gives this discount; it replaces a typed discount. Null when there is none. */
  promotion: { id: number; name: string; discountSatang: number } | null
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
  /** The promotion the till will be given. It sets the discount, so a typed one is ignored. */
  promotion?: { id: number; name: string; discountSatang: number } | null
}

/** What the till needs to know about an option to price it. */
export interface CartOption {
  id: number
  name: string
  priceSatang: number
}

const exceeds = (product: Product | undefined, quantity: number) =>
  product !== undefined && product.trackStock && quantity > product.stockQty

/** How many units of each product the lines ask for in all: stock is shared by a product's lines. */
function demandByProduct(lines: readonly { productId: number; quantity: number; packSize?: number }[]) {
  const demand = new Map<number, number>()
  for (const { productId, quantity, packSize = 1 } of lines)
    demand.set(productId, (demand.get(productId) ?? 0) + quantity * packSize)
  return demand
}

/**
 * Prices a cart from the current product data. All amounts are integers in the minor unit, and the
 * totals come from the same function the server uses, so the screen never disagrees with the receipt.
 * Lines whose product is no longer sellable are left out rather than charged at a stale price; a line
 * whose option is no longer offered is kept but blocks payment.
 */
export function priceCart(
  lines: readonly CartLine[],
  products: ReadonlyMap<number, Product>,
  discountInput: string,
  options: PricingOptions,
  optionsById: ReadonlyMap<number, CartOption> = new Map(),
): PricedCart {
  const packOf = (productId: number, packId: number | null) =>
    packId === null ? null : (products.get(productId)?.packs.find((pack) => pack.id === packId && pack.isActive) ?? null)
  const demand = demandByProduct(lines.map((line) => ({ ...line, packSize: packOf(line.productId, line.packId)?.size ?? 1 })))
  const priced: PricedLine[] = []
  for (const { key, productId, optionIds, packId, quantity } of lines) {
    const product = products.get(productId)
    if (!product) continue
    const chosen = optionIds.flatMap((id) => optionsById.get(id) ?? [])
    const pack = packOf(productId, packId)
    const packSize = pack?.size ?? 1
    const unitPriceSatang = pack
      ? packUnitPriceSatang(product.priceSatang, pack)
      : product.priceSatang + chosen.reduce((total, option) => total + option.priceSatang, 0)
    priced.push({
      lineKey: key,
      lineId: null,
      productId,
      name: product.name,
      unitPriceSatang,
      quantity,
      lineTotalSatang: unitPriceSatang * quantity,
      options: chosen.map(({ name, priceSatang }) => ({ name, priceSatang })),
      optionIds: [...optionIds],
      packId,
      packSize,
      exceedsStock: exceeds(product, demand.get(productId) ?? quantity * packSize),
      stockQty: product.stockQty,
      unavailable: chosen.length !== optionIds.length || (packId !== null && pack === null),
      sentQuantity: 0,
      note: null,
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
  const demand = demandByProduct(items)
  const priced: PricedLine[] = items.map((item) => {
    const product = products.get(item.productId)
    return {
      lineKey: String(item.lineId),
      lineId: item.lineId,
      productId: item.productId,
      name: item.productName,
      unitPriceSatang: item.unitPriceSatang,
      quantity: item.quantity,
      lineTotalSatang: item.unitPriceSatang * item.quantity,
      options: item.options.map(({ name, priceSatang }) => ({ name, priceSatang })),
      optionIds: item.options.map((option) => option.optionId),
      packId: null,
      packSize: 1,
      exceedsStock: exceeds(product, demand.get(item.productId) ?? item.quantity),
      stockQty: product?.stockQty ?? 0,
      unavailable: false,
      sentQuantity: item.sentQuantity,
      note: item.note,
    }
  })
  return summarize(priced, discountInput, options)
}

function summarize(
  priced: PricedLine[],
  discountInput: string,
  { vatMode, vatRateBp, parseAmount, promotion = null }: PricingOptions,
): PricedCart {
  const subtotalSatang = priced.reduce((sum, line) => sum + line.lineTotalSatang, 0)
  const itemCount = priced.reduce((sum, line) => sum + line.quantity, 0)

  // A promotion and a typed discount are never added together: the promotion wins while it applies.
  const typed = promotion || discountInput.trim() === '' ? 0 : parseAmount(discountInput)
  const isDiscountValid = typed !== null && typed <= subtotalSatang
  const discountSatang = promotion
    ? Math.min(promotion.discountSatang, subtotalSatang)
    : isDiscountValid
      ? typed
      : 0
  const { vatSatang, totalSatang } = calculateTotals({ subtotalSatang, discountSatang, vatMode, vatRateBp })

  return {
    lines: priced,
    itemCount,
    subtotalSatang,
    discountSatang,
    isDiscountValid,
    promotion,
    vatSatang,
    totalSatang,
    canPay:
      priced.length > 0 &&
      isDiscountValid &&
      totalSatang > 0 &&
      !priced.some((line) => line.exceedsStock || line.unavailable),
  }
}
