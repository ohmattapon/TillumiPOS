import { and, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { PriceQuoteEntity, type PricedQuote } from '../../../../domains/price-quote.domain'
import { priceQuotes } from '../../../../infrastructure/database/schema/price-quotes'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IPriceQuoteRepository } from '../../applications/ports/price-quote.repository'

@injectable()
export class DrizzlePriceQuoteRepository implements IPriceQuoteRepository {
  async create(quote: PricedQuote) {
    const [row] = await currentExecutor().insert(priceQuotes).values(quote).returning()
    return new PriceQuoteEntity(row!)
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.id, id))
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByIdForUpdate(id: number) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.id, id)).for('update')
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByQrReference(reference: string) {
    const [row] = await currentExecutor().select().from(priceQuotes).where(eq(priceQuotes.qrReference, reference))
    return row ? new PriceQuoteEntity(row) : null
  }

  async findByQrReferenceForUpdate(reference: string) {
    const [row] = await currentExecutor()
      .select()
      .from(priceQuotes)
      .where(eq(priceQuotes.qrReference, reference))
      .for('update')
    return row ? new PriceQuoteEntity(row) : null
  }

  async hasReservedForOrder(orderId: number) {
    const [row] = await currentExecutor()
      .select({ id: priceQuotes.id })
      .from(priceQuotes)
      .where(and(eq(priceQuotes.orderId, orderId), eq(priceQuotes.status, 'reserved')))
      .limit(1)
    return row !== undefined
  }

  async save(quote: PriceQuoteEntity) {
    const { id, status, qrReference, saleId } = quote.toSnapshot()
    const [row] = await currentExecutor()
      .update(priceQuotes)
      .set({ status, qrReference, saleId, updatedAt: new Date() })
      .where(eq(priceQuotes.id, id))
      .returning()
    if (!row) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
    return new PriceQuoteEntity(row)
  }
}
