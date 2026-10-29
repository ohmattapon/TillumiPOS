import { sql } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { Page } from '../../../../domains/page'
import type { SalesReportSums } from '../../../../domains/sales-report'
import type {
  ISalesReportRepository, SalesReportPeriod, ReportOverviewSums, ReportProduct, ReportPageQuery, ReportPromotion, ReportCashier, ReportItem, ReportItemQuery,
} from '../../applications/ports/sales-report.repository'

// Aggregate sale costs first: joining lines or payments directly would multiply bill totals.
const facts = (period: SalesReportPeriod) => sql`
  bounds as (
    select ${period.from}::date as from_day, ${period.to}::date as to_day,
      ${period.from}::date::timestamp at time zone ${period.timeZone} as from_at,
      (${period.to}::date + 1)::timestamp at time zone ${period.timeZone} as to_at
  ),
  period_sales as (
    select s.* from sales s, bounds b
    where s.created_at >= b.from_at and s.created_at < b.to_at
      and ${period.branchId === null ? sql`true` : sql`s.branch_id = ${period.branchId}`}
      and ${period.cashierId === undefined ? sql`true` : sql`s.cashier_id = ${period.cashierId}`}
      and ${period.customer === undefined ? sql`true` : period.customer === 'member' ? sql`s.member_id is not null` : sql`s.member_id is null`}
  ),
  costs as (
    select i.sale_id, sum(i.unit_cost_satang::bigint * i.quantity) as cost_satang
    from sale_items i join period_sales s on s.id = i.sale_id group by i.sale_id
  ),
  facts as (
    select s.*, coalesce(c.cost_satang, 0) as cost_satang,
      (s.created_at at time zone ${period.timeZone})::date as day
    from period_sales s left join costs c on c.sale_id = s.id
  )
`
const sums = sql`jsonb_build_object(
  'saleCount', count(*) filter (where status = 'completed'),
  'voidedCount', count(*) filter (where status = 'voided'),
  'totalSatang', coalesce(sum(total_satang) filter (where status = 'completed'), 0),
  'vatSatang', coalesce(sum(vat_satang) filter (where status = 'completed'), 0),
  'discountSatang', coalesce(sum(discount_satang) filter (where status = 'completed'), 0),
  'costSatang', coalesce(sum(cost_satang) filter (where status = 'completed'), 0),
  'changeSatang', coalesce(sum(change_satang) filter (where status = 'completed'), 0)
)`

@injectable()
export class DrizzleSalesReportRepository implements ISalesReportRepository {
  async overview(period: SalesReportPeriod): Promise<ReportOverviewSums> {
    // A single statement gives the summary, daily figures and tenders one database snapshot.
    const [row] = await currentExecutor().execute<{ overview: ReportOverviewSums }>(sql`
      with ${facts(period)},
      daily as (select day, ${sums} as totals from facts group by day),
      tendered as (
        select p.method, sum(p.amount_satang)::bigint as amount
        from payments p join period_sales s on s.id = p.sale_id
        where s.status = 'completed' group by p.method
      )
      select jsonb_build_object(
        'summary', (select ${sums} from facts),
        'days', coalesce((select jsonb_agg(
          coalesce(d.totals, '{"saleCount":0,"voidedCount":0,"totalSatang":0,"vatSatang":0,"discountSatang":0,"costSatang":0,"changeSatang":0}'::jsonb)
          || jsonb_build_object('day', series.day::date::text) order by series.day)
          from bounds b
          cross join lateral generate_series(b.from_day::timestamp, b.to_day::timestamp, interval '1 day') series(day)
          left join daily d on d.day = series.day::date), '[]'::jsonb),
        'tendered', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'amountSatang', amount) order by method)
          from tendered), '[]'::jsonb)
      ) as overview
    `)
    return row!.overview
  }

  async products(query: ReportPageQuery): Promise<Page<ReportProduct>> {
    const [row] = await currentExecutor().execute<{ items: ReportProduct[]; total: number }>(sql`
      with ${facts(query)},
      grouped as (
        select i.product_id as "productId",
          (array_agg(i.product_name order by i.id desc))[1] as "productName",
          (array_agg(i.sku order by i.id desc))[1] as sku,
          sum(i.quantity) as quantity, sum(i.line_total_satang) as "lineTotalSatang"
        from sale_items i join period_sales s on s.id = i.sale_id
        where s.status = 'completed' group by i.product_id
      ),
      paged as (select * from grouped order by quantity desc, "lineTotalSatang" desc, "productId"
        limit ${query.limit} offset ${query.offset})
      select coalesce((select jsonb_agg(to_jsonb(paged) order by quantity desc, "lineTotalSatang" desc, "productId") from paged), '[]'::jsonb) as items,
        (select count(*)::integer from grouped) as total
    `)
    return { items: row!.items as ReportProduct[], total: Number(row!.total) }
  }

  async items(query: ReportItemQuery): Promise<Page<ReportItem>> {
    // Lines sold before the category snapshot have a null `category_id`. `products.category_id` is read as
    // their fallback, so a category filter still finds them; a line that kept its own category never uses it.
    const category = sql`coalesce(i.category_id, p.category_id)`
    const categoryFilter = query.categoryId === undefined ? sql`true`
      : query.categoryId === null ? sql`${category} is null` : sql`${category} = ${query.categoryId}`
    // Ties end in product id and pack size so a page boundary never repeats or skips a row.
    const order = {
      quantity: sql`quantity desc, "productId", "packSize"`,
      sales: sql`"netSalesSatang" desc, "productId", "packSize"`,
      profit: sql`"profitSatang" desc, "productId", "packSize"`,
      // A row with no net sales has no margin, so it goes last.
      margin: sql`("netSalesSatang" = 0), "profitSatang"::numeric / nullif("netSalesSatang", 0) desc, "productId", "packSize"`,
    }[query.sort]
    const [row] = await currentExecutor().execute<{ items: ReportItem[]; total: number }>(sql`
      with ${facts(query)},
      grouped as (
        select i.product_id as "productId", i.pack_size as "packSize",
          (array_agg(i.product_name order by i.id desc))[1] as "productName",
          (array_agg(i.sku order by i.id desc))[1] as sku,
          sum(i.quantity)::bigint as quantity,
          sum(i.quantity::bigint * i.pack_size) as pieces,
          coalesce(sum(i.allocated_total_satang - i.allocated_vat_satang), 0)::bigint as "netSalesSatang",
          coalesce(sum(i.allocated_vat_satang), 0)::bigint as "vatSatang",
          sum(i.unit_cost_satang::bigint * i.quantity) as "costSatang"
        from sale_items i
        join period_sales s on s.id = i.sale_id
        join products p on p.id = i.product_id
        where s.status = 'completed' and ${categoryFilter}
        group by i.product_id, i.pack_size
      ),
      profits as (select *, "netSalesSatang" - "costSatang" as "profitSatang" from grouped),
      ranked as (select *, row_number() over (order by ${order}) as rn from profits),
      paged as (select * from ranked order by rn limit ${query.limit} offset ${query.offset})
      select coalesce((select jsonb_agg(to_jsonb(paged) - 'rn' order by rn) from paged), '[]'::jsonb) as items,
        (select count(*)::integer from grouped) as total
    `)
    return { items: row!.items as ReportItem[], total: Number(row!.total) }
  }

  async branches(query: ReportPageQuery): Promise<Page<SalesReportSums & { branchId: number }>> {
    const [row] = await currentExecutor().execute<{ items: (SalesReportSums & { branchId: number })[]; total: number }>(sql`
      with ${facts(query)},
      grouped as (select branch_id, ${sums} as totals from facts group by branch_id),
      paged as (select * from grouped order by (totals->>'totalSatang')::bigint desc, branch_id
        limit ${query.limit} offset ${query.offset})
      select coalesce((select jsonb_agg(totals || jsonb_build_object('branchId', branch_id)
        order by (totals->>'totalSatang')::bigint desc, branch_id) from paged), '[]'::jsonb) as items,
        (select count(*)::integer from grouped) as total
    `)
    return { items: row!.items as (SalesReportSums & { branchId: number })[], total: Number(row!.total) }
  }

  async promotions(query: ReportPageQuery): Promise<Page<ReportPromotion>> {
    // The promotion lives in the bill's snapshot, so a voided or renamed promotion changes nothing here.
    // The snapshot is stored as a JSON string, so it is unwrapped before its keys are read; JSON null
    // (a bill with no promotion) unwraps to `null`, whose keys are SQL null.
    const snapshot = sql`(s.promotion #>> '{}')::jsonb`
    const [row] = await currentExecutor().execute<{ items: ReportPromotion[]; total: number }>(sql`
      with ${facts(query)},
      grouped as (
        select (${snapshot} ->> 'id')::integer as "promotionId",
          (array_agg(${snapshot} ->> 'name' order by s.id desc))[1] as name,
          count(*)::integer as bills,
          coalesce(sum(s.discount_satang), 0)::integer as "discountSatang",
          coalesce(sum(s.total_satang - s.vat_satang), 0)::integer as "netSalesSatang"
        from period_sales s
        where s.status = 'completed' and ${snapshot} ->> 'id' is not null
        group by (${snapshot} ->> 'id')::integer
      ),
      paged as (select * from grouped order by "discountSatang" desc, "promotionId"
        limit ${query.limit} offset ${query.offset})
      select coalesce((select jsonb_agg(to_jsonb(paged) order by "discountSatang" desc, "promotionId") from paged), '[]'::jsonb) as items,
        (select count(*)::integer from grouped) as total
    `)
    return { items: row!.items as ReportPromotion[], total: Number(row!.total) }
  }

  async cashiers(period: SalesReportPeriod): Promise<ReportCashier[]> {
    // The filters would hide every cashier but the chosen one, so they are dropped here.
    const { cashierId: _cashier, customer: _customer, ...range } = period
    const [row] = await currentExecutor().execute<{ items: ReportCashier[] }>(sql`
      with ${facts(range)},
      grouped as (
        select s.cashier_id as "cashierId",
          (array_agg(s.cashier_name order by s.id desc))[1] as "cashierName",
          count(*)::integer as bills
        from period_sales s group by s.cashier_id
      )
      select coalesce(jsonb_agg(to_jsonb(grouped) order by bills desc, "cashierId"), '[]'::jsonb) as items from grouped
    `)
    return row!.items
  }
}
