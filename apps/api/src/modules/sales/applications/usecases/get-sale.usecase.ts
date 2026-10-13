import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'

/** Query. */
@injectable()
export class GetSaleUseCase {
  constructor(@inject(saleRepositoryToken) private readonly sales: ISaleRepository) {}

  /** A sale of another branch is reported as not found, so branches cannot read each other's bills. */
  async execute(id: number, branchId: number) {
    const sale = await this.sales.findById(id)
    if (!sale || sale.branchId !== branchId) throw new DomainNotFoundError('ไม่พบบิลขาย')
    return sale
  }
}
