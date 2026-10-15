import type { LineOption } from '../../../../domains/modifier.domain'
import type { SaleEntity, SalePayment } from '../../../../domains/sale.domain'

export interface CheckoutLine {
  productId: number
  quantity: number
  /**
   * What the line costs per unit, options included, as agreed earlier (an order quoted it when the item
   * was added). Without it the product's current price plus the options is charged.
   */
  unitPriceSatang?: number
  /** The options already resolved and kept by an order. Used together with `unitPriceSatang`. */
  options?: readonly LineOption[]
  /** The ids chosen in a one-step sale; checked and priced by the checkout. */
  optionIds?: readonly number[]
}

export interface CheckoutRequest {
  memberId?: number | null
  /**
   * A price pinned earlier by a quote. The sale then charges that quote's prices, discount, promotion and
   * VAT rules, and the quote is used up with it. A sale without one prices the lines as they are now.
   */
  quoteId?: number | null
  lines: CheckoutLine[]
  discountSatang: number
  /** A `promptpay` payment may name the confirmed QR payment that backs it. */
  payments: (SalePayment & { qrPaymentId?: number })[]
  cashier: { id: number; displayName: string }
  branch: { id: number; code: string }
  /** Required for shift-mode v2 requests; legacy v1 passes no shift. */
  shiftId?: number
}

/**
 * Turns lines and payments into a stored sale: prices and settles it with the shop's current VAT rules,
 * deducts the branch's stock, and issues the receipt number. The one way a sale is made, whether it was
 * rung up in a single step or built as an order first.
 * Must be called inside a unit of work, so the sale, stock and receipt number commit or roll back together.
 */
export interface ISaleCheckout {
  checkout(request: CheckoutRequest): Promise<SaleEntity>
}

const saleCheckoutTokenSymbol: unique symbol = Symbol('ISaleCheckout')
export const saleCheckoutToken = saleCheckoutTokenSymbol.toString()
