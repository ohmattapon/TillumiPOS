import { and, eq, sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { sales } from '../../../../infrastructure/database/schema/sales'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IMemberSalesHistory, MemberHistoryQuery, MemberHistoryPage, MemberSaleHeader } from '../../../members/applications/ports/member-sales-history.port'

/** One statement gives the page, filtered count and successful totals the same database snapshot. */
@injectable()
export class DrizzleMemberSalesHistory implements IMemberSalesHistory {
  async find(query: MemberHistoryQuery): Promise<MemberHistoryPage> {
    const matching = and(
      eq(sales.memberId, query.memberId), eq(sales.branchId, query.branchId),
      query.status ? eq(sales.status, query.status) : undefined,
      query.from ? sql`${sales.createdAt} >= (${query.from}::date::timestamp at time zone ${query.timeZone})` : undefined,
      query.to ? sql`${sales.createdAt} < ((${query.to}::date + 1)::timestamp at time zone ${query.timeZone})` : undefined,
    )
    const rows = await currentExecutor().execute(sql`
      with matching as (
        select id, receipt_no, branch_id, cashier_name, status, total_satang, created_at
        from ${sales} where ${matching}
      ), paged as (
        select * from matching order by id desc limit ${query.limit} offset ${query.offset}
      )
      select
        (select coalesce(jsonb_agg(jsonb_build_object(
          'id',id,'receiptNo',receipt_no,'branchId',branch_id,'cashierName',cashier_name,
          'status',status,'totalSatang',total_satang,'createdAt',created_at
        ) order by id desc), '[]'::jsonb) from paged) as items,
        (select count(*)::int from matching) as total,
        (select count(*)::int from matching where status='completed') as sale_count,
        (select coalesce(sum(total_satang),0)::bigint from matching where status='completed') as total_satang
    `)
    const row = rows[0] as {items: (Omit<MemberSaleHeader,'createdAt'> & {createdAt:string})[]; total:number; sale_count:number; total_satang:string}
    return { items: row.items.map(item => ({...item,createdAt:new Date(item.createdAt)})), total:Number(row.total),
      summary: {saleCount:Number(row.sale_count), totalSatang:Number(row.total_satang)} }
  }
}
