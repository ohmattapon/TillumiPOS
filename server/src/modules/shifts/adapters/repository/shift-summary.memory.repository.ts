import { inject, injectable } from 'tsyringe'
import type { ShiftCashTotals, ShiftSummary } from '../../../../domains/shift-summary'
import { shiftRepositoryToken, type IShiftRepository } from '../../applications/ports/shift.repository'
import type { FrozenShiftSummary, IShiftSummaryRepository } from '../../applications/ports/shift-summary.repository'

const emptyTotals = (): ShiftCashTotals => ({ cashSaleSatang: 0, cashInSatang: 0, cashOutSatang: 0, cashRefundSatang: 0 })

/**
 * No-database shift summaries: cash totals are summed from the shift
 * module's own repository through its port, while the frozen report taken
 * when counting starts lives in a Map. Freezing replaces an earlier,
 * cancelled count's report, like the drizzle twin's upsert.
 */
@injectable()
export class MemoryShiftSummaryRepository implements IShiftSummaryRepository {
  private readonly frozen = new Map<number, FrozenShiftSummary>()

  constructor(@inject(shiftRepositoryToken) private readonly shifts: IShiftRepository) {}

  async cashTotals(shiftId: number) {
    const totals = emptyTotals()
    let offset = 0
    for (;;) {
      const page = await this.shifts.listCashEntries(shiftId, 500, offset)
      for (const entry of page.items) {
        if (entry.kind === 'cash_sale') totals.cashSaleSatang += entry.amountSatang
        else if (entry.kind === 'cash_in') totals.cashInSatang += entry.amountSatang
        else if (entry.kind === 'cash_out') totals.cashOutSatang += entry.amountSatang
        else totals.cashRefundSatang += entry.amountSatang
      }
      offset += page.items.length
      if (offset >= page.total) return totals
    }
  }

  async freeze(shiftId: number, summary: ShiftSummary, capturedAt: Date) {
    this.frozen.set(shiftId, { summary: { ...summary }, capturedAt })
  }

  async discard(shiftId: number) {
    this.frozen.delete(shiftId)
  }

  async findFrozen(shiftId: number) {
    return this.frozen.get(shiftId) ?? null
  }
}
