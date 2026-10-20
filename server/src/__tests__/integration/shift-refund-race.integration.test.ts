import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../../libs/db'
import { runInTransaction } from '../../libs/transaction-context'
import { DrizzleShiftRepository } from '../../modules/shifts/adapters/repository/shift.drizzle.repository'
import { ShiftLedger } from '../../modules/shifts/applications/services/shift-ledger'
import { ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const idempotency = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
})

afterEach(() => {
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

describe('a sale refunded from two shifts at once', () => {
  test('the second refund is told the sale is already refunded', async () => {
    const owner = await signIn('owner')
    const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
    const second = ok(await owner.apiV2.registers.post({ code: 'BACK', name: 'หลังร้าน' }))
    const shiftA = ok(await owner.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, idempotency()))
    const shiftB = ok(await owner.apiV2.shifts.post({ registerId: second.id, openingCashSatang: 100_000 }, idempotency()))
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 2 })
    const sale = ok(await owner.apiV2.sales.post({
      shiftId: shiftA.id, items: [{ productId: tea.id, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 1000 }],
    }, idempotency()))
    const ledger = new ShiftLedger(new DrizzleShiftRepository())
    const refund = (shiftId: number) => ({
      shiftId, branchId: 1, saleId: sale.id, actorId: owner.user.id, actorName: 'owner', amountSatang: 1000, reason: 'คืนเงิน', createdAt: new Date(),
    })

    // The first refund is inserted but not committed. The second passes its own check, since it cannot see
    // that row, and then waits on the unique index until the first commits.
    let release!: () => void
    let inserted!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    const insertedFirst = new Promise<void>((resolve) => { inserted = resolve })
    const first = runInTransaction(async () => {
      await ledger.recordSaleRefund(refund(shiftA.id))
      inserted()
      await hold
    })
    await insertedFirst
    const loser = runInTransaction(() => ledger.recordSaleRefund(refund(shiftB.id)))
    const failure = loser.then(() => null, (error: unknown) => error)
    for (let waiting = 0; waiting < 1;) {
      await Bun.sleep(10)
      const [row] = await db.execute<{ waiting: number }>(sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock'`)
      waiting = row!.waiting
    }
    release()
    await first

    expect(await failure).toMatchObject({ code: 'SALE_ALREADY_REFUNDED' })
  })
})
