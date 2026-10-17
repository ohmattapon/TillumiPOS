import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { quoteIdSchema } from '../schemas/quote-schemas'

/** Command: abandons an open quote. One that a QR holds is released by cancelling that QR instead. */
@injectable()
export class CancelQuoteUseCase {
  constructor(
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(id: number, branchId: number) {
    quoteIdSchema.parse({ id })
    return this.unitOfWork.run(async () => {
      const quote = await this.quotes.findByIdForUpdate(id)
      if (!quote || quote.branchId !== branchId) throw new DomainNotFoundError('ไม่พบราคาที่ตรึงไว้', 'QUOTE_NOT_FOUND')
      return this.quotes.save(quote.cancel())
    })
  }
}
