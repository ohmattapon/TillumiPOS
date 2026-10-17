import type { PriceQuoteEntity } from '../../../../domains/price-quote.domain'
import type { QuoteResponse } from './schemas/quote.schema'

/** The cost of a line's options is internal, like the cost of a sale line: it is not part of the answer. */
export function toQuoteResponse(quote: PriceQuoteEntity): QuoteResponse {
  const snapshot = quote.toSnapshot()
  return {
    id: snapshot.id,
    branchId: snapshot.branchId,
    memberId: snapshot.memberId,
    member: snapshot.member,
    orderId: snapshot.orderId,
    lines: snapshot.lines.map(({ options, ...line }) => ({
      ...line,
      options: options.map(({ costSatang: _cost, ...option }) => option),
    })),
    subtotalSatang: snapshot.subtotalSatang,
    promotion: snapshot.promotion,
    discountSatang: snapshot.discountSatang,
    vatMode: snapshot.vatMode,
    vatRateBp: snapshot.vatRateBp,
    vatSatang: snapshot.vatSatang,
    totalSatang: snapshot.totalSatang,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt,
    createdAt: snapshot.createdAt,
  }
}
