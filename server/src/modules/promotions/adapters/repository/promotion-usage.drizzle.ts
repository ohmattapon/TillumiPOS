import { and, count, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { priceQuotes } from '../../../../infrastructure/database/schema/price-quotes'
import { promotions } from '../../../../infrastructure/database/schema/promotions'
import { sales } from '../../../../infrastructure/database/schema/sales'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IPromotionStats } from '../../applications/ports/promotion-stats.port'
import type {
  IPromotionUsage,
  PromotionUseCounts,
  PromotionUseLimits,
} from '../../../quotes/applications/ports/promotion-usage.port'

/** The promotion named by a quote's jsonb snapshot. An empty snapshot never names anything. */
const quotePromotionId = (promotionId: number) =>
  sql`(coalesce(${priceQuotes.promotion} ->> 'id', '0'))::int = ${promotionId}`

/** The same, for a whole list of promotions; `= any` keeps one query instead of one per id. */
const quotePromotionIdIn = (promotionIds: readonly number[]) =>
  sql`(coalesce(${priceQuotes.promotion} ->> 'id', '0'))::int = any(${promotionIds}::int[])`

/**
 * Answers the usage-limit questions the quotes module asks. Completed (not voided) sales count through
 * `sales.promotion_id`, so voiding a bill frees the slot; a quote a QR holds is counted already, because
 * the money may reach the bank while the customer walks away and the bill is not made yet.
 */
@injectable()
export class DrizzlePromotionUsage implements IPromotionUsage, IPromotionStats {
  async countUses(promotionId: number, memberId: number | null): Promise<PromotionUseCounts> {
    // One query per table: `total` over every counting row, `byMember` only for rows of this member.
    const sold = await currentExecutor()
      .select({
        total: count(),
        byMember: memberId === null ? sql<number>`0` : sql<number>`count(*) filter (where ${sales.memberId} = ${memberId})`,
      })
      .from(sales)
      .where(and(eq(sales.promotionId, promotionId), eq(sales.status, 'completed')))
    const held = await currentExecutor()
      .select({
        total: count(),
        byMember: memberId === null ? sql<number>`0` : sql<number>`count(*) filter (where ${priceQuotes.memberId} = ${memberId})`,
      })
      .from(priceQuotes)
      .where(and(eq(priceQuotes.status, 'reserved'), quotePromotionId(promotionId)))
    return {
      total: (sold[0]!.total ?? 0) + (held[0]!.total ?? 0),
      byMember: Number(sold[0]!.byMember ?? 0) + Number(held[0]!.byMember ?? 0),
    }
  }

  async countMany(promotionIds: readonly number[]): Promise<Map<number, PromotionUseCounts>> {
    const uses = new Map<number, PromotionUseCounts>(promotionIds.map((id) => [id, { total: 0, byMember: 0 }]))
    if (promotionIds.length === 0) return uses
    const soldRows = await currentExecutor()
      .select({ promotionId: sales.promotionId, total: count() })
      .from(sales)
      .where(and(eq(sales.status, 'completed'), sql`${sales.promotionId} = any(${promotionIds}::int[])`))
      .groupBy(sales.promotionId)
    const heldRows = await currentExecutor()
      .select({
        promotionId: sql<number>`(coalesce(${priceQuotes.promotion} ->> 'id', '0'))::int`,
        total: count(),
      })
      .from(priceQuotes)
      .where(and(eq(priceQuotes.status, 'reserved'), quotePromotionIdIn(promotionIds)))
      .groupBy(sql`(coalesce(${priceQuotes.promotion} ->> 'id', '0'))::int`)
    for (const row of [...soldRows, ...heldRows]) {
      if (row.promotionId === null) continue
      uses.set(row.promotionId, { ...uses.get(row.promotionId)!, total: uses.get(row.promotionId)!.total + row.total })
    }
    return uses
  }

  async usageOf(promotionIds: readonly number[]): Promise<Map<number, number>> {
    const counts = await this.countMany(promotionIds)
    return new Map([...counts].map(([promotionId, value]) => [promotionId, value.total]))
  }

  async lockForUse(promotionId: number): Promise<PromotionUseLimits> {
    // The answer comes from the locked row itself, so a limit the shop edited after a quote was pinned still governs.
    const [row] = await currentExecutor()
      .select({ maxUses: promotions.maxUses, maxUsesPerMember: promotions.maxUsesPerMember })
      .from(promotions)
      .where(eq(promotions.id, promotionId))
      .for('update')
    if (!row) return { maxUses: null, maxUsesPerMember: null }
    return { maxUses: row.maxUses ?? null, maxUsesPerMember: row.maxUsesPerMember ?? null }
  }
}
