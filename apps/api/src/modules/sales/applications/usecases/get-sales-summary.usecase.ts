import { inject, injectable } from 'tsyringe'
import type { PaymentMethod } from '../../../../domains/sale.domain'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import { salesSummarySchema } from '../schemas/sale-schemas'

export interface SalesSummary {
  saleCount: number
  totalSatang: number
  vatSatang: number
  discountSatang: number
  /** Revenue after bill discounts, minus the cost snapshot of every line sold. */
  profitSatang: number
  /** Money actually kept per method: cash is net of the change handed back. */
  byMethod: { method: PaymentMethod; amountSatang: number }[]
}

/** Query: totals for completed sales in [from, to). */
@injectable()
export class GetSalesSummaryUseCase {
  constructor(@inject(saleRepositoryToken) private readonly sales: ISaleRepository) {}

  async execute(input: unknown, branchId: number): Promise<SalesSummary> {
    const { changeSatang, costSatang, tendered, ...totals } = await this.sales.sumCompleted({
      ...salesSummarySchema.parse(input),
      branchId,
    })

    return {
      ...totals,
      profitSatang: totals.totalSatang - costSatang,
      // Change always comes out of the cash drawer, so it is taken off the cash tendered.
      byMethod: tendered.map((row) =>
        row.method === 'cash' ? { ...row, amountSatang: row.amountSatang - changeSatang } : row,
      ),
    }
  }
}
