import { injectable } from 'tsyringe'
import type { PaymentMethod } from '../../../../domains/sale.domain'
import type { ShiftSalesTotals } from '../../../../domains/shift-summary'
import type { IShiftSalesTotals } from '../../applications/ports/shift-sales-totals.port'
import { MemorySaleRepository } from './sale.memory.repository'

const METHOD_ORDER: PaymentMethod[] = ['card', 'cash', 'promptpay']

/**
 * Answers the shifts module's question from the sales' own memory store, so
 * shifts never read the sales tables themselves. The demo composition root
 * must hand this the same MemorySaleRepository singleton the sale token gets.
 * Voided sales stay in the gross and are reported apart, like the drizzle twin.
 */
@injectable()
export class MemoryShiftSalesTotals implements IShiftSalesTotals {
  constructor(private readonly sales: MemorySaleRepository) {}

  async forShift(shiftId: number): Promise<ShiftSalesTotals> {
    const recorded = await this.sales.findByShift(shiftId)
    const voided = recorded.filter((sale) => sale.status === 'voided')
    const tendered = new Map<PaymentMethod, number>()
    for (const sale of recorded)
      for (const payment of sale.payments)
        tendered.set(payment.method, (tendered.get(payment.method) ?? 0) + payment.amountSatang)
    return {
      saleCount: recorded.length,
      grossSalesSatang: recorded.reduce((total, sale) => total + sale.totalSatang, 0),
      voidedCount: voided.length,
      voidedSatang: voided.reduce((total, sale) => total + sale.totalSatang, 0),
      changeSatang: recorded.reduce((total, sale) => total + sale.changeSatang, 0),
      // Alphabetical by method, like the drizzle twin's `order by payments.method`.
      tendered: METHOD_ORDER.filter((method) => tendered.has(method)).map((method) => ({
        method,
        amountSatang: tendered.get(method)!,
      })),
    }
  }
}
