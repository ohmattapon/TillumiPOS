// Runs against throwaway pos_load_inv_tpl (seeded once) and pos_load_inv_test (a fresh copy per test) on the local
// server named by LOAD_DB_ADMIN_URL, and skips when that is not set, so a plain `bun test ./load` needs no database.
// Each violation test commits one broken row into its own copy, so checkInvariants reads it through its own
// read-only transaction exactly as it does after a real run.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { SQL } from 'bun'
import { randomBytes } from 'node:crypto'
import { baseSetupEnv, cloneDatabase, dropDatabase, migrateAndSeedBase, recreateDatabase, targetUrl } from './lib/database'
import { checkInvariants, formatInvariants, INVARIANT_NAMES, type InvariantResult } from './invariants'
import { DEFAULT_REFERENCE_DATE, seedLoadData } from './seed'

const adminUrl = Bun.env.LOAD_DB_ADMIN_URL
const TEMPLATE = 'pos_load_inv_tpl'
const DB_NAME = 'pos_load_inv_test'

if (!adminUrl) console.warn('invariants.test.ts skipped: set LOAD_DB_ADMIN_URL to the admin connection of the local PostgreSQL server')

test('checkInvariants refuses a handle connected to a database that is not pos_load*, before checking anything', async () => {
  const calls: string[] = []
  const handle = {
    unsafe: async (query: string) => {
      calls.push(query)
      return /current_database\(\)/.test(query) ? [{ name: 'pos' }] : []
    },
    begin: async () => {
      calls.push('begin')
      throw new Error('a transaction must not be started')
    },
  } as unknown as SQL
  await expect(checkInvariants(handle)).rejects.toThrow('database name')
  expect(calls).toEqual(['select current_database() as name'])
})

/** A fresh copy of the seeded template, broken by `breakIt`, then checked. */
async function checkAfter(breakIt: (sql: SQL) => Promise<unknown>): Promise<InvariantResult[]> {
  await cloneDatabase(adminUrl!, TEMPLATE, DB_NAME)
  const sql = new SQL(targetUrl(adminUrl!, DB_NAME))
  try {
    await breakIt(sql)
    return await checkInvariants(sql)
  } finally {
    await sql.close()
  }
}

function expectOnlyFailure(results: InvariantResult[], name: (typeof INVARIANT_NAMES)[number]) {
  expect(results.map((result) => result.name)).toEqual([...INVARIANT_NAMES])
  expect(results.filter((result) => !result.passed).map((result) => result.name)).toEqual([name])
  const failed = results.find((result) => result.name === name)!
  expect(failed.violations).toBeGreaterThanOrEqual(1)
  expect(failed.sample?.length).toBeGreaterThanOrEqual(1)
  expect(failed.sample!.length).toBeLessThanOrEqual(5)
}

/** The running API stores its jsonb values as a JSON string holding the object, so the tests write them that way. */
const apiJson = (value: unknown) => JSON.stringify(JSON.stringify(value))

const ownerId = async (sql: SQL) => (await sql`select id from users where username = 'admin'`)[0].id as number

/** A completed bill with at least one line of a tracked product. */
async function completedTrackedSale(sql: SQL): Promise<{ id: number; receipt_no: string }> {
  const [sale] = await sql`
    select s.id, s.receipt_no from sales s
    where s.status = 'completed'
      and exists (select 1 from sale_items i join products p on p.id = i.product_id where i.sale_id = s.id and p.track_stock)
    order by s.id limit 1`
  expect(sale).toBeDefined()
  return sale
}

describe.skipIf(!adminUrl)('checkInvariants', () => {
  beforeAll(async () => {
    await recreateDatabase(adminUrl!, TEMPLATE)
    const databaseUrl = targetUrl(adminUrl!, TEMPLATE)
    await migrateAndSeedBase(baseSetupEnv(databaseUrl, randomBytes(18).toString('base64url')))
    const sql = new SQL(databaseUrl)
    await seedLoadData(sql, { products: 20, members: 10, pastSales: 200, cashierPassword: randomBytes(12).toString('base64url'), cashierPin: '482913', referenceDate: DEFAULT_REFERENCE_DATE }).finally(() => sql.close())
  }, 300_000)

  afterAll(async () => {
    if (!adminUrl) return
    await dropDatabase(adminUrl, DB_NAME)
    await dropDatabase(adminUrl, TEMPLATE)
  })

  test('every invariant passes on a freshly seeded database', async () => {
    const results = await checkAfter(async () => {})
    expect(results.map((result) => result.name)).toEqual([...INVARIANT_NAMES])
    for (const result of results) expect(result).toEqual({ name: result.name, passed: true, violations: 0 })
  })

  test('two bills with one receipt number', async () => {
    const results = await checkAfter(async (sql) => {
      // The unique constraint is what the check backs up, so this copy goes without it.
      await sql`alter table sales drop constraint "sales_receiptNo_unique"`
      const [a, b] = await sql`select id, receipt_no from sales where status = 'completed' order by id limit 2`
      await sql`update sales set receipt_no = ${a.receipt_no} where id = ${b.id}`
    })
    expectOnlyFailure(results, 'receipt_numbers_unique')
  })

  test('a tracked product below zero, with the ledger agreeing', async () => {
    const results = await checkAfter(async (sql) => {
      const [stock] = await sql`
        select b.branch_id, b.product_id, b.qty from branch_stock b join products p on p.id = b.product_id
        where p.track_stock order by b.product_id limit 1`
      await sql`update branch_stock set qty = -1 where branch_id = ${stock.branch_id} and product_id = ${stock.product_id}`
      await sql`
        insert into stock_movements (branch_id, product_id, type, quantity, balance_after, user_id)
        values (${stock.branch_id}, ${stock.product_id}, 'adjust', ${-1 - stock.qty}, -1, ${await ownerId(sql)})`
    })
    expectOnlyFailure(results, 'stock_not_negative')
  })

  test('a ledger row the stock level never saw', async () => {
    const results = await checkAfter(async (sql) => {
      const [stock] = await sql`select branch_id, product_id, qty from branch_stock order by product_id limit 1`
      await sql`
        insert into stock_movements (branch_id, product_id, type, quantity, balance_after, user_id)
        values (${stock.branch_id}, ${stock.product_id}, 'adjust', 1, ${stock.qty + 1}, ${await ownerId(sql)})`
    })
    expectOnlyFailure(results, 'stock_matches_ledger')
  })

  test('payments one satang off the amount paid', async () => {
    const results = await checkAfter(async (sql) => {
      const [sale] = await sql`select id from sales where status = 'completed' order by id limit 1`
      await sql`insert into payments (sale_id, method, amount_satang) values (${sale.id}, 'cash', 1)`
    })
    expectOnlyFailure(results, 'payments_match_bill')
  })

  test('one idempotency key that made two bills', async () => {
    const results = await checkAfter(async (sql) => {
      await sql`alter table command_receipts drop constraint "command_receipts_actorId_branchId_action_key_unique"`
      const [a, b] = await sql`select id, cashier_id, branch_id from sales where status = 'completed' order by id limit 2`
      const key = crypto.randomUUID()
      for (const sale of [a, b])
        await sql`
          insert into command_receipts (actor_id, branch_id, action, key, request_hash, result)
          values (${a.cashier_id}, ${a.branch_id}, 'sales.checkout', ${key}, 'same', ${apiJson({ id: sale.id })}::text::jsonb)`
    })
    expectOnlyFailure(results, 'one_bill_per_idempotency_key')
  })

  test('a points balance one point off its ledger', async () => {
    const results = await checkAfter(async (sql) => {
      await sql`update members set points_balance = points_balance + 1 where id = (select min(id) from members)`
    })
    expectOnlyFailure(results, 'points_balance_matches_ledger')
  })

  test('a bill that earned its points twice', async () => {
    const results = await checkAfter(async (sql) => {
      // The unique index is what the check backs up, so this copy goes without it; the balance follows the ledger.
      await sql`drop index member_point_movements_sale_kind_unique`
      const [member] = await sql`select min(id) as id from members`
      const [sale] = await sql`select id from sales where status = 'completed' order by id limit 1`
      const owner = await ownerId(sql)
      for (let time = 0; time < 2; time++)
        await sql`insert into member_point_movements (member_id, kind, points, sale_id, created_by_id) values (${member.id}, 'earn', 1, ${sale.id}, ${owner})`
      await sql`update sales set points_earned = 2 where id = ${sale.id}`
      await sql`update members set points_balance = points_balance + 2 where id = ${member.id}`
    })
    expectOnlyFailure(results, 'points_once_per_sale')
  })

  test('paid QR money with no bill and no dismissal', async () => {
    const results = await checkAfter(async (sql) => {
      await sql`
        insert into qr_payments (branch_id, reference, amount_satang, status, qr_raw_data, expires_at, paid_at, created_by_id)
        values ((select id from branches where code = 'MAIN'), 'LOADINVTEST1', 100, 'paid', 'raw', now() + interval '15 minutes', now(), ${await ownerId(sql)})`
    })
    expectOnlyFailure(results, 'paid_qr_has_bill')
  })

  const closedShift = async (sql: SQL) => {
    const owner = await ownerId(sql)
    const [shift] = await sql`
      insert into shifts (branch_id, register_id, status, opened_at, opened_by_id, opened_by_name, opening_cash_satang, currency, time_zone, closed_at, closed_by_id, closed_by_name)
      values ((select id from branches where code = 'MAIN'), (select min(id) from registers), 'closed', now() - interval '1 hour', ${owner}, 'owner', 0, 'THB', 'Asia/Bangkok', now(), ${owner}, 'owner')
      returning id`
    return shift.id as number
  }

  test('a closed shift with no summary', async () => {
    const results = await checkAfter(async (sql) => {
      await closedShift(sql)
    })
    expectOnlyFailure(results, 'closed_shift_has_matching_summary')
  })

  test('a closed shift whose summary counts a bill the shift does not have', async () => {
    const results = await checkAfter(async (sql) => {
      const shiftId = await closedShift(sql)
      const summary = { saleCount: 1, grossSalesSatang: 0, voidedCount: 0, voidedSatang: 0, changeSatang: 0, tendered: [] }
      await sql`insert into shift_summaries (shift_id, summary, captured_at) values (${shiftId}, ${apiJson(summary)}::text::jsonb, now())`
    })
    expectOnlyFailure(results, 'closed_shift_has_matching_summary')
  })

  test('line shares one satang off the bill total', async () => {
    const results = await checkAfter(async (sql) => {
      await sql`update sale_items set allocated_total_satang = allocated_total_satang + 1 where id = (select min(id) from sale_items)`
    })
    expectOnlyFailure(results, 'line_shares_add_up_to_bill')
  })

  test('a voided bill whose stock never came back', async () => {
    const results = await checkAfter(async (sql) => {
      const sale = await completedTrackedSale(sql)
      await sql`update sales set status = 'voided', voided_at = now(), voided_by_id = ${await ownerId(sql)}, void_reason = 'test' where id = ${sale.id}`
    })
    expectOnlyFailure(results, 'void_returns_each_line')
  })
})

test('formatInvariants prints one row per check and the sample under a failed one', () => {
  const text = formatInvariants([
    { name: 'receipt_numbers_unique', passed: true, violations: 0 },
    { name: 'paid_qr_has_bill', passed: false, violations: 2, sample: [{ qr_payment_id: 7, amount_satang: 100 }] },
  ])
  expect(text.split('\n')).toEqual([
    'Invariant               Passed  Violations',
    'receipt_numbers_unique  yes     0',
    'paid_qr_has_bill        NO      2',
    '                          {"qr_payment_id":7,"amount_satang":100}',
  ])
})
