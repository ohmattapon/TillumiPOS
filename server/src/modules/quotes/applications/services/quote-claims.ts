import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { hasUsesLeft } from '../../../../domains/promotion.domain'
import type { PriceQuoteEntity, QuoteRequest } from '../../../../domains/price-quote.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { orderQuoteSourceToken, type IOrderQuoteSource } from '../ports/order-quote-source.port'
import { promotionLimitReached, promotionUsageToken, type IPromotionUsage } from '../ports/promotion-usage.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import type { IQuoteClaims } from '../ports/quote-claims.port'

const notFound = () => new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')

@injectable()
export class QuoteClaims implements IQuoteClaims {
  constructor(
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(orderQuoteSourceToken) private readonly orders: IOrderQuoteSource,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(promotionUsageToken) private readonly usage: IPromotionUsage,
  ) {}

  async lockForCheckout(quoteId: number, request: QuoteRequest, claimedReferences: readonly string[]) {
    const quote = await this.quotes.findByIdForUpdate(quoteId)
    // Another branch's quote is not even acknowledged to exist.
    if (!quote || quote.branchId !== request.branchId) throw notFound()
    quote.assertSellable(request, this.clock.now(), claimedReferences)
    await this.assertUsageLeft(quote)
    return quote
  }

  /**
   * A promotion with usage limits must still have a slot: the row is locked first so two payments at
   * once cannot both pass. A quote a QR holds already spent its slot when it was reserved, and the money
   * may already be at the bank, so it is never re-checked.
   */
  private async assertUsageLeft(quote: PriceQuoteEntity) {
    if (quote.status === 'reserved') return
    const promotionId = quote.promotion?.id
    if (promotionId === undefined) return
    const limits = await this.usage.lockForUse(promotionId)
    if (limits === null) return
    const counts = await this.usage.countUses(promotionId, quote.memberId)
    if (!hasUsesLeft(limits, counts, quote.memberId !== null)) throw promotionLimitReached()
  }

  /** The quote a QR holds: while the QR is held, and after it was cancelled, when its money may still arrive. */
  async findHeldByReference(reference: string) {
    const quote = await this.quotes.findByQrReference(reference)
    return quote?.status === 'reserved' || quote?.status === 'cancelled' ? quote.id : null
  }

  /** The QR holding an order's price, so the till can show it and cancel it. Read only. */
  async findHeldByOrder(orderId: number, branchId: number) {
    const quote = await this.quotes.findReservedByOrder(orderId)
    return quote && quote.branchId === branchId ? quote.qrReference : null
  }

  async consume(quote: PriceQuoteEntity, saleId: number) {
    await this.quotes.save(quote.consume(saleId))
  }

  async reserveForQr(quoteId: number, { branchId, reference, amountSatang }: { branchId: number; reference: string; amountSatang: number }) {
    const found = await this.quotes.findById(quoteId)
    if (!found || found.branchId !== branchId) throw notFound()

    // An order is locked before its quote, as everywhere else, and must still be what was priced.
    const order = found.orderId === null ? null : await this.orders.lockOpenOrder(found.orderId, branchId)
    const quote = await this.quotes.findByIdForUpdate(quoteId)
    if (!quote || quote.branchId !== branchId) throw notFound()
    if (order) {
      const unchanged = quote.matches({
        branchId,
        memberId: order.memberId,
        orderId: quote.orderId,
        lines: order.items.map((item) => ({
          productId: item.productId,
          optionIds: item.options.map((option) => option.optionId),
          quantity: item.quantity,
          packId: item.packId,
        })),
      })
      if (!unchanged)
        throw new DomainConflictError('ออเดอร์เปลี่ยนไปจากราคาที่ตรึงไว้ กรุณาขอราคาใหม่', 'QUOTE_MISMATCH')
    }
    quote.assertQrAmount(amountSatang)
    // Reserving is what spends a slot, but the money has not moved yet, so a full promotion still refuses here.
    await this.assertUsageLeft(quote)
    await this.quotes.save(quote.reserve(reference, this.clock.now()))
  }

  async releaseByReference(reference: string) {
    const quote = await this.quotes.findByQrReferenceForUpdate(reference)
    if (!quote) return
    const released = quote.release(reference)
    if (released !== quote) await this.quotes.save(released)
  }

  async cancelByReference(reference: string) {
    const quote = await this.quotes.findByQrReferenceForUpdate(reference)
    if (!quote) return
    const cancelled = quote.cancelReserved(reference)
    if (cancelled !== quote) await this.quotes.save(cancelled)
  }
}
