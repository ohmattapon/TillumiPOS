import { eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import type { ShiftSummary } from '../../../../domains/shift-summary'
import { shiftCashEntries } from '../../../../infrastructure/database/schema/shift-cash-entries'
import { shiftSummaries } from '../../../../infrastructure/database/schema/shift-summaries'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShiftSummaryRepository } from '../../applications/ports/shift-summary.repository'

const sumOf = (kind: string) =>
  sql<string>`coalesce(sum(case when ${shiftCashEntries.kind} = ${kind} then ${shiftCashEntries.amountSatang} else 0 end), 0)::text`

@injectable()
export class DrizzleShiftSummaryRepository implements IShiftSummaryRepository {
  async cashTotals(shiftId: number) {
    const [row] = await currentExecutor()
      .select({
        cashSale: sumOf('cash_sale'),
        cashIn: sumOf('cash_in'),
        cashOut: sumOf('cash_out'),
        cashRefund: sumOf('cash_refund'),
      })
      .from(shiftCashEntries)
      .where(eq(shiftCashEntries.shiftId, shiftId))

    return {
      cashSaleSatang: Number(row!.cashSale),
      cashInSatang: Number(row!.cashIn),
      cashOutSatang: Number(row!.cashOut),
      cashRefundSatang: Number(row!.cashRefund),
    }
  }

  async freeze(shiftId: number, summary: ShiftSummary, capturedAt: Date) {
    await currentExecutor()
      .insert(shiftSummaries)
      .values({ shiftId, summary, capturedAt })
      .onConflictDoUpdate({ target: shiftSummaries.shiftId, set: { summary, capturedAt } })
  }

  async discard(shiftId: number) {
    await currentExecutor().delete(shiftSummaries).where(eq(shiftSummaries.shiftId, shiftId))
  }

  async findFrozen(shiftId: number) {
    const [row] = await currentExecutor()
      .select({ summary: shiftSummaries.summary, capturedAt: shiftSummaries.capturedAt })
      .from(shiftSummaries)
      .where(eq(shiftSummaries.shiftId, shiftId))
    return row ?? null
  }
}
