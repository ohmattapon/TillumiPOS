import type { LineOption } from '../../../../domains/modifier.domain'

export interface QuotedOrder {
  id: number
  memberId: number | null
  items: {
    productId: number
    productName: string
    sku: string
    /** The price quoted when the line was added, options included. */
    unitPriceSatang: number
    quantity: number
    options: LineOption[]
    /** An order holds loose pieces only. */
    packId: null
    packSize: 1
  }[]
}

/** The lines of an open order, for pricing it. The orders module answers it. */
export interface IOrderQuoteSource {
  /** An open order of this branch. ORDER_NOT_FOUND otherwise, and a conflict when it is no longer open. */
  read(orderId: number, branchId: number): Promise<QuotedOrder>
  /** Like read, but row-locks the order until the surrounding unit of work ends. */
  lockOpenOrder(orderId: number, branchId: number): Promise<QuotedOrder>
}

const token: unique symbol = Symbol('IOrderQuoteSource')
export const orderQuoteSourceToken = token.toString()
