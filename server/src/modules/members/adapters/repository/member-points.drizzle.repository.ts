import { and, eq, inArray, sql, sum } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { members } from '../../../../infrastructure/database/schema/members'
import { memberPointMovements } from '../../../../infrastructure/database/schema/member-point-movements'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type {
  ICheckoutPoints,
  PointMovementEntry,
} from '../../../sales/applications/ports/checkout-points.port'
import type { IQuotePoints } from '../../../quotes/applications/ports/quote-points.port'

/**
 * Answers the sales and quotes modules from our own ledger, so a bill never reads
 * the members' tables. Every method must run inside the caller's unit of work: the
 * row and the cached balance move together, or not at all.
 */
@injectable()
export class DrizzleMemberPointsLedger implements ICheckoutPoints, IQuotePoints {
  async balanceOf(memberId: number): Promise<number> {
    const [row] = await currentExecutor()
      .select({ balance: members.pointsBalance })
      .from(members)
      .where(eq(members.id, memberId))
    return row?.balance ?? 0
  }

  async lockMember(memberId: number): Promise<void> {
    const rows = await currentExecutor()
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, memberId))
      .for('update')
    if (rows.length === 0) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
  }

  async record(entry: PointMovementEntry): Promise<{ balanceAfter: number }> {
    const executor = currentExecutor()
    try {
      await executor.insert(memberPointMovements).values({
        memberId: entry.memberId,
        kind: entry.kind,
        points: entry.points,
        saleId: entry.saleId,
        quoteId: entry.quoteId,
        reason: entry.reason,
        createdById: entry.actorId,
      })
    } catch (error) {
      // The unique index on (sale, kind) is what makes a retried command safe.
      if (isUniqueViolation(error))
        throw new DomainConflictError('บันทึกแต้มของรายการนี้ไปแล้ว', 'POINTS_ALREADY_RECORDED')
      throw error
    }

    const [row] = await executor
      .update(members)
      .set({ pointsBalance: sql`${members.pointsBalance} + ${entry.points}` })
      .where(
        and(
          eq(members.id, entry.memberId),
          sql`${members.pointsBalance} + ${entry.points} >= 0`,
        ),
      )
      .returning({ balance: members.pointsBalance })
    // The guard above is where a negative balance is refused; no row means it would have gone below zero.
    if (!row) throw new DomainConflictError('แต้มคงเหลือไม่พอ', 'POINTS_NOT_ENOUGH')
    return { balanceAfter: row.balance }
  }

  async findQuoteRedemption(quoteId: number): Promise<number | null> {
    const [row] = await currentExecutor()
      .select({ points: sum(memberPointMovements.points) })
      .from(memberPointMovements)
      .where(
        and(
          eq(memberPointMovements.quoteId, quoteId),
          inArray(memberPointMovements.kind, ['redeem', 'void_redeem']),
        ),
      )
    // Redeem rows are stored negative and a return is positive, so what is still held is what they leave.
    const held = -(Number(row?.points ?? 0))
    return held > 0 ? held : null
  }
}
