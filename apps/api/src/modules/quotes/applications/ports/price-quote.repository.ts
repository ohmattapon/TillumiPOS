import type { PriceQuoteEntity, PricedQuote } from '../../../../domains/price-quote.domain'

export interface IPriceQuoteRepository {
  create(quote: PricedQuote): Promise<PriceQuoteEntity>
  findById(id: number): Promise<PriceQuoteEntity | null>
  /** Like findById, but row-locks the quote until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<PriceQuoteEntity | null>
  /** The quote a QR holds, by the reference 1 sent to the bank. */
  findByQrReference(reference: string): Promise<PriceQuoteEntity | null>
  findByQrReferenceForUpdate(reference: string): Promise<PriceQuoteEntity | null>
  /** Whether a quote of this order is held by a QR that has not been settled yet. */
  hasReservedForOrder(orderId: number): Promise<boolean>
  /** Writes the status, QR reference and sale of an existing quote. */
  save(quote: PriceQuoteEntity): Promise<PriceQuoteEntity>
}

const token: unique symbol = Symbol('IPriceQuoteRepository')
export const priceQuoteRepositoryToken = token.toString()
