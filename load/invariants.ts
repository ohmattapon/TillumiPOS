// What must still be true of the data after a load run, whatever the latency was. Each check is one SQL query that
// returns the number of violations and at most five of them, so it costs the same on 100 bills as on 100,000 and
// never pulls rows into memory. Samples hold ids and numbers only: no member name or phone, no key, no login.
import type { SQL } from 'bun'
import { assertLoadDatabaseName } from './lib/safety'

export interface InvariantResult {
  name: string
  passed: boolean
  violations: number
  sample?: unknown[]
}

const SAMPLE_SIZE = 5

/** Each query selects the violating rows; the runner counts them and keeps a sample. */
const CHECKS = {
  // The unique constraint should make this impossible; the check proves it held under load.
  receipt_numbers_unique: `
    select min(id) as first_sale_id, count(*)::int as bills from sales
    group by receipt_no having count(*) > 1`,

  stock_not_negative: `
    select b.branch_id, b.product_id, b.qty from branch_stock b
    join products p on p.id = b.product_id
    where p.track_stock and b.qty < 0`,

  // branch_stock is a cache of the append-only ledger: every level is the sum of its movements, and no movement
  // belongs to a level that does not exist.
  stock_matches_ledger: `
    select coalesce(b.branch_id, m.branch_id) as branch_id, coalesce(b.product_id, m.product_id) as product_id,
           b.qty, m.total::bigint as ledger
    from branch_stock b
    full join (select branch_id, product_id, sum(quantity) as total from stock_movements group by branch_id, product_id) m
      on m.branch_id = b.branch_id and m.product_id = b.product_id
    where coalesce(b.qty, 0) <> coalesce(m.total, 0)`,

  // A cash row stores what was tendered, so the rows add up to paid_satang and the change brings it to the total.
  payments_match_bill: `
    select s.id as sale_id, s.total_satang, s.paid_satang, s.change_satang, coalesce(p.amount, 0)::bigint as payments
    from sales s
    left join (select sale_id, sum(amount_satang) as amount from payments group by sale_id) p on p.sale_id = s.id
    where coalesce(p.amount, 0) <> s.paid_satang or s.paid_satang - s.change_satang <> s.total_satang`,

  // A bill-making command replays its first result for the same (actor, action, key): one key, one bill, and one
  // bill is never the result of two commands. A receipt naming a bill that does not exist is just as wrong.
  one_bill_per_idempotency_key: `
    with bills as (
      select id, actor_id, action, key, (result->>'id')::int as sale_id from command_receipts
      where action in ('sales.checkout', 'orders.pay'))
    select 'one key, several receipts' as problem, actor_id, action, min(sale_id) as sale_id, count(*)::int as receipts
    from bills group by actor_id, action, key having count(*) > 1
    union all
    select 'one bill, several commands', min(actor_id), min(action), sale_id, count(*)::int
    from bills group by sale_id having count(*) > 1
    union all
    select 'no such bill', actor_id, action, sale_id, 1 from bills b
    where not exists (select 1 from sales s where s.id = b.sale_id)`,

  points_balance_matches_ledger: `
    select m.id as member_id, m.points_balance, coalesce(l.points, 0)::bigint as ledger
    from members m
    left join (select member_id, sum(points) as points from member_point_movements group by member_id) l on l.member_id = m.id
    where m.points_balance <> coalesce(l.points, 0)`,

  // A bill earns, redeems and gives each back at most once, earns exactly what it says it earned, gives points back
  // only when voided, and a void returns all the points it redeemed.
  points_once_per_sale: `
    with per_sale as (
      select sale_id,
             count(*) filter (where kind = 'earn') as earns,
             coalesce(sum(points) filter (where kind = 'earn'), 0) as earned,
             count(*) filter (where kind = 'redeem') as redeems,
             count(*) filter (where kind = 'void_earn') as void_earns,
             count(*) filter (where kind = 'void_redeem') as void_redeems,
             coalesce(sum(points) filter (where kind = 'void_redeem'), 0) as returned
      from member_point_movements where sale_id is not null group by sale_id)
    select p.sale_id, s.status, s.points_earned, p.earned::bigint, p.earns::int, p.redeems::int, p.void_earns::int, p.void_redeems::int
    from per_sale p left join sales s on s.id = p.sale_id
    where p.earns > 1 or p.redeems > 1 or p.void_earns > 1 or p.void_redeems > 1
       or s.id is null
       or p.earned <> s.points_earned
       or (s.status <> 'voided' and p.void_earns + p.void_redeems > 0)
       or (s.status = 'voided' and s.points_redeemed > 0 and p.returned <> s.points_redeemed)
    union all
    select s.id, s.status, s.points_earned, 0, 0, 0, 0, 0 from sales s
    where s.points_earned > 0 and not exists (select 1 from member_point_movements m where m.sale_id = s.id)`,

  // Money the bank says arrived must become a bill or be dismissed by the owner.
  paid_qr_has_bill: `
    select id as qr_payment_id, origin_shift_id, amount_satang from qr_payments
    where status = 'paid' and sale_id is null and dismissed_at is null`,

  // The summary is frozen when counting starts and no bill joins a shift after that, so a closed shift's summary
  // still counts every bill of the shift (voided or not), their change and what was tendered per method.
  // Voids after the cut-off are reported beside the summary, so the voided figures are not compared.
  closed_shift_has_matching_summary: `
    with totals as (
      select shift_id, count(*) as sales, sum(total_satang) as gross, sum(change_satang) as change
      from sales where shift_id is not null group by shift_id),
    tendered as (
      select shift_id, jsonb_agg(jsonb_build_object('method', method, 'amountSatang', amount) order by method) as tendered
      from (select s.shift_id, p.method, sum(p.amount_satang) as amount from payments p join sales s on s.id = p.sale_id
            where s.shift_id is not null group by s.shift_id, p.method) per_method
      group by shift_id)
    select sh.id as shift_id, ss.shift_id is not null as has_summary,
           (ss.summary->>'saleCount')::bigint as summary_sales, coalesce(t.sales, 0)::bigint as sales,
           (ss.summary->>'grossSalesSatang')::bigint as summary_gross, coalesce(t.gross, 0)::bigint as gross
    from shifts sh
    left join shift_summaries ss on ss.shift_id = sh.id
    left join totals t on t.shift_id = sh.id
    left join tendered td on td.shift_id = sh.id
    where sh.status = 'closed'
      and (ss.shift_id is null
        or (ss.summary->>'saleCount')::bigint <> coalesce(t.sales, 0)
        or (ss.summary->>'grossSalesSatang')::bigint <> coalesce(t.gross, 0)
        or (ss.summary->>'changeSatang')::bigint <> coalesce(t.change, 0)
        or coalesce(ss.summary->'tendered', '[]'::jsonb) <> coalesce(td.tendered, '[]'::jsonb))`,

  // Every line carries its share of the bill's total and VAT, and the shares add up to the bill exactly.
  line_shares_add_up_to_bill: `
    select s.id as sale_id, s.total_satang, s.vat_satang, i.total::bigint as line_total, i.vat::bigint as line_vat, coalesce(i.missing, 0)::int as lines_without_share
    from sales s
    left join (
      select sale_id, sum(allocated_total_satang) as total, sum(allocated_vat_satang) as vat,
             count(*) filter (where allocated_total_satang is null or allocated_vat_satang is null) as missing
      from sale_items group by sale_id) i on i.sale_id = s.id
    where i.sale_id is null or i.missing > 0 or i.total <> s.total_satang or i.vat <> s.vat_satang`,

  // A void puts back every tracked line once, in pieces; a bill that is not voided has no void movement.
  void_returns_each_line: `
    with expected as (
      select s.receipt_no, s.branch_id, i.product_id, count(*) as lines, sum(i.quantity * i.pack_size) as pieces
      from sales s join sale_items i on i.sale_id = s.id join products p on p.id = i.product_id
      where s.status = 'voided' and p.track_stock
      group by s.receipt_no, s.branch_id, i.product_id),
    actual as (
      select reference as receipt_no, branch_id, product_id, count(*) as movements, sum(quantity) as pieces
      from stock_movements where type = 'void'
      group by reference, branch_id, product_id)
    select (select id from sales where receipt_no = coalesce(e.receipt_no, a.receipt_no)) as sale_id,
           coalesce(e.product_id, a.product_id) as product_id,
           coalesce(e.lines, 0)::int as lines, coalesce(a.movements, 0)::int as movements,
           coalesce(e.pieces, 0)::bigint as pieces, coalesce(a.pieces, 0)::bigint as returned
    from expected e
    full join actual a on a.receipt_no = e.receipt_no and a.branch_id = e.branch_id and a.product_id = e.product_id
    where e.lines is distinct from a.movements or e.pieces is distinct from a.pieces`,
} as const

export const INVARIANT_NAMES = Object.keys(CHECKS) as (keyof typeof CHECKS)[]

/** Bigint columns arrive as strings or bigints; samples are small numbers, so they are shown as numbers. */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]))
}

/**
 * Runs every check in one read-only, repeatable-read transaction, so all of them see the same moment and none can
 * write. Refuses a handle that is not connected to a pos_load* database before it checks anything.
 */
export async function checkInvariants(sql: SQL): Promise<InvariantResult[]> {
  const [connected] = await sql.unsafe('select current_database() as name')
  assertLoadDatabaseName(String(connected?.name ?? ''))
  return sql.begin('isolation level repeatable read read only', async (tx) => {
    const results: InvariantResult[] = []
    for (const name of INVARIANT_NAMES) {
      const [row] = await tx.unsafe(`
        with violations as materialized (${CHECKS[name]})
        select (select count(*) from violations)::int as count,
               (select coalesce(json_agg(sample), '[]'::json) from (select * from violations limit ${SAMPLE_SIZE}) sample)::text as sample`)
      const violations = Number(row.count)
      const sample = (JSON.parse(row.sample) as Record<string, unknown>[]).map(plain)
      results.push(violations === 0 ? { name, passed: true, violations } : { name, passed: false, violations, sample })
    }
    return results
  })
}

/** The terminal table: one row per check, and under a failed one its sample (ids and numbers only). */
export function formatInvariants(results: InvariantResult[]): string {
  const width = Math.max('Invariant'.length, ...results.map((result) => result.name.length))
  const lines = [`${'Invariant'.padEnd(width)}  Passed  Violations`]
  for (const result of results) {
    lines.push(`${result.name.padEnd(width)}  ${(result.passed ? 'yes' : 'NO').padEnd(6)}  ${result.violations}`)
    for (const row of result.sample ?? []) lines.push(`${' '.repeat(width)}    ${JSON.stringify(row)}`)
  }
  return lines.join('\n')
}
