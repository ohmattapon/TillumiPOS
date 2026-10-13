import { inject, injectable } from 'tsyringe'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import { listSalesSchema } from '../schemas/sale-schemas'

/** Query. */
@injectable()
export class ListSalesUseCase {
  constructor(@inject(saleRepositoryToken) private readonly sales: ISaleRepository) {}

  async execute(input: unknown, branchId: number) {
    return this.sales.findHeaders({ ...listSalesSchema.parse(input), branchId })
  }
}
