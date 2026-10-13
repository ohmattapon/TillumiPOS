import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'

/** Query. */
@injectable()
export class GetSaleUseCase {
  constructor(@inject(saleRepositoryToken) private readonly sales: ISaleRepository) {}

  async execute(id: number) {
    const sale = await this.sales.findById(id)
    if (!sale) throw new DomainNotFoundError('ไม่พบบิลขาย')
    return sale
  }
}
