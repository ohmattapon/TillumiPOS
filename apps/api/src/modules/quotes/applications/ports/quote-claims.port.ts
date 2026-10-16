import type { PriceQuoteEntity, QuoteRequest } from '../../../../domains/price-quote.domain'

/**
 * How a sale and a QR use a quote. Kept apart from the rest of the module so they depend only on what
 * they need. Every call belongs inside the unit of work that stores the sale or the QR.
 */
export interface IQuoteClaims {
  /**
   * Row-locks the quote of this branch and throws unless a sale for `request` may use it now, given the
   * references of the QR payments backing the sale. QUOTE_NOT_FOUND for another branch's quote.
   */
  lockForCheckout(quoteId: number, request: QuoteRequest, claimedReferences: readonly string[]): Promise<PriceQuoteEntity>
  /** The id of the quote a QR holds, or null. Not locked: used to refuse a sale that left the quote out. */
  findHeldByReference(reference: string): Promise<number | null>
  /** The reference of the QR that holds the reserved quote of an order in this branch, or null. */
  findHeldByOrder(orderId: number, branchId: number): Promise<string | null>
  /** Ties the (locked) quote to the sale it was used for. */
  consume(quote: PriceQuoteEntity, saleId: number): Promise<void>
  /**
   * Holds the quote for the QR that is about to be made. For a quote of an order the order is locked
   * first and must still be what was priced. The QR may be for part of the total but not more.
   */
  reserveForQr(quoteId: number, claim: { branchId: number; reference: string; amountSatang: number }): Promise<void>
  /** The QR was cancelled or never made: the quote is open again. Does nothing when no quote is held. */
  releaseByReference(reference: string): Promise<void>
  /** The QR's money was set aside by the owner: the quote is closed. Does nothing when no quote is held. */
  cancelByReference(reference: string): Promise<void>
}

const token: unique symbol = Symbol('IQuoteClaims')
export const quoteClaimsToken = token.toString()
