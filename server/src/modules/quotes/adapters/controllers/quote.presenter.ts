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
    // The schema widens with Task 2's OpenAPI change, when the migration actually allows storing a bundle;
    // no such quote can exist before that, but the snapshot type already carries the wider union.
    promotion: snapshot.promotion as QuoteResponse['promotion'],
    // The typed coupon code is shown back to the till even when a better automatic promotion won.
    couponCode: snapshot.couponCode,
    discountSatang: snapshot.discountSatang,
    pointsRedeemed: snapshot.pointsRedeemed ?? 0,
    pointsDiscountSatang: snapshot.pointsDiscountSatang ?? 0,
    vatMode: snapshot.vatMode,
    vatRateBp: snapshot.vatRateBp,
    vatSatang: snapshot.vatSatang,
    totalSatang: snapshot.totalSatang,
    status: snapshot.status,
    expiresAt: snapshot.expiresAt,
    createdAt: snapshot.createdAt,
  }
}
