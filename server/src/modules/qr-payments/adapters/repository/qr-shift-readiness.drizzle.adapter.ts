import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { qrPayments } from '../../../../infrastructure/database/schema/qr-payments'
import { shiftQrAttempts } from '../../../../infrastructure/database/schema/shift-qr-attempts'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IQrShiftReadiness } from '../../applications/ports/qr-shift-readiness.port'

@injectable()
export class DrizzleQrShiftReadiness implements IQrShiftReadiness {
  async forShift(shiftId: number) {
    const executor = currentExecutor()

    const [attempts] = await executor
      .select({ total: count() })
      .from(shiftQrAttempts)
      .where(and(eq(shiftQrAttempts.originShiftId, shiftId), inArray(shiftQrAttempts.state, ['creating', 'unknown'])))

    const ofShift = eq(qrPayments.originShiftId, shiftId)
    const [unclaimed] = await executor
      .select({ total: count() })
      .from(qrPayments)
      .where(and(ofShift, eq(qrPayments.status, 'paid'), isNull(qrPayments.saleId), isNull(qrPayments.dismissedAt)))
    const [pending] = await executor
      .select({ total: count(), amount: sql<string>`coalesce(sum(${qrPayments.amountSatang}), 0)::text` })
      .from(qrPayments)
      .where(and(ofShift, eq(qrPayments.status, 'pending')))

    return {
      unresolvedAttempts: attempts!.total,
      paidUnclaimed: unclaimed!.total,
      pending: { count: pending!.total, amountSatang: Number(pending!.amount) },
    }
  }
}
