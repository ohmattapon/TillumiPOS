import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PriceQuoteEntity, type PriceQuoteProps, type PricedQuote } from '../../../../domains/price-quote.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import type { IPriceQuoteRepository } from '../../applications/ports/price-quote.repository'

const missing = () => new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')

/**
 * No-database quote store: one Map, ids assigned from 1 in creation order.
 * A sale keeps working from the pinned values even after the money arrived,
 * so saving only moves the status, QR reference and sale, like the drizzle
 * twin's SET clause — never the priced lines.
 */
@injectable()
export class MemoryPriceQuoteRepository implements IPriceQuoteRepository {
  private readonly rows = new Map<number, PriceQuoteProps>()
  private nextId = 1

  constructor(@inject(TOKENS.Clock) private readonly clock: IClock) {}

  async create(quote: PricedQuote) {
    const stored: PriceQuoteProps = {
      ...quote,
      member: quote.member ? { ...quote.member } : null,
      promotion: quote.promotion ? { ...quote.promotion } : null,
      lines: quote.lines.map((line) => ({ ...line, options: [...line.options] })),
      id: this.nextId++,
      status: 'open',
      qrReference: null,
      saleId: null,
      createdAt: this.clock.now(),
    }
    this.rows.set(stored.id, stored)
    return new PriceQuoteEntity(stored)
  }

  async findById(id: number) {
    const row = this.rows.get(id)
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    // No-op by design: a single process has no concurrent transactions to
    // serialize, so there is nothing to lock. This must stay a no-op only
    // here — the drizzle twin takes a real row lock instead.
    return this.findById(id)
  }

  async findByQrReference(reference: string) {
    const row = [...this.rows.values()].find((candidate) => candidate.qrReference === reference)
    return row ? new PriceQuoteEntity(row) : null
  }

  async findReservedByOrder(orderId: number) {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.orderId === orderId && candidate.status === 'reserved',
    )
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByQrReferenceForUpdate(reference: string) {
    // No-op by design, like findByIdForUpdate above.
    return this.findByQrReference(reference)
  }

  async hasReservedForOrder(orderId: number) {
    return [...this.rows.values()].some(
      (candidate) => candidate.orderId === orderId && candidate.status === 'reserved',
    )
  }

  async save(quote: PriceQuoteEntity) {
    const stored = this.rows.get(quote.id)
    if (!stored) throw missing()
    const snapshot = quote.toSnapshot()
    this.rows.set(stored.id, {
      ...stored,
      status: snapshot.status,
      qrReference: snapshot.qrReference,
      saleId: snapshot.saleId,
    })
    return new PriceQuoteEntity(this.rows.get(stored.id)!)
  }
}
