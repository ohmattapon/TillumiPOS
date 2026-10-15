import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { quoteIdSchema } from '../schemas/quote-schemas'

/** Query: a pure read. It never extends, expires or writes anything. */
@injectable()
export class GetQuoteUseCase {
  constructor(@inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository) {}

  async execute(id: number, branchId: number) {
    quoteIdSchema.parse({ id })
    const quote = await this.quotes.findById(id)
    if (!quote || quote.branchId !== branchId) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
    return quote
  }
}
