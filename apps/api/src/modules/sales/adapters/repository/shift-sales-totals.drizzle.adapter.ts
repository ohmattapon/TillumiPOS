import { count, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { payments, sales } from '../../../../infrastructure/database/schema/sales'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IShiftSalesTotals } from '../../applications/ports/shift-sales-totals.port'

const sum = (expression: ReturnType<typeof sql>) => sql<string>`coalesce(sum(${expression}), 0)::text`

@injectable()
export class DrizzleShiftSalesTotals implements IShiftSalesTotals {
  async forShift(shiftId: number) {
    const executor = currentExecutor()
    const ofShift = eq(sales.shiftId, shiftId)

    const [totals] = await executor
      .select({
        saleCount: count(),
        gross: sum(sql`${sales.totalSatang}`),
        change: sum(sql`${sales.changeSatang}`),
        voidedCount: sql<string>`count(*) filter (where ${sales.status} = 'voided')::text`,
        voided: sum(sql`case when ${sales.status} = 'voided' then ${sales.totalSatang} else 0 end`),
      })
      .from(sales)
      .where(ofShift)
    const tendered = await executor
      .select({ method: payments.method, amount: sum(sql`${payments.amountSatang}`) })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(ofShift)
      .groupBy(payments.method)
      .orderBy(payments.method)

    return {
      saleCount: totals!.saleCount,
      grossSalesSatang: Number(totals!.gross),
      voidedCount: Number(totals!.voidedCount),
      voidedSatang: Number(totals!.voided),
      changeSatang: Number(totals!.change),
      tendered: tendered.map((row) => ({ method: row.method, amountSatang: Number(row.amount) })),
    }
  }
}
