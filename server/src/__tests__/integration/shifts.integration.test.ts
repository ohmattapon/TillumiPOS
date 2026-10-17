import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const idempotency = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

describe('registers and shared shifts', () => {
  test('seeds MAIN per branch and restricts register management to the owner', async () => {
    const registers = ok(await owner.apiV2.registers.get())
    expect(registers.items).toHaveLength(1)
    expect(registers.items[0]).toMatchObject({ code: 'MAIN', branchId: 1 })

    expect((await cashier.apiV2.registers.post({ code: 'FRONT', name: 'หน้า' })).status).toBe(403)
    const created = ok(await owner.apiV2.registers.post({ code: 'FRONT', name: 'เคาน์เตอร์หน้า' }))
    expect(created).toMatchObject({ code: 'FRONT', isActive: true })
  })

  test('cashiers share a shift, record manual drawer movements, and close against a frozen cash count', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const opened = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 10000 }, idempotency()))
    expect(opened).toMatchObject({ status: 'open', openedById: cashier.user.id, openingCashSatang: 10000 })
    expect((await owner.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 1 }, idempotency())).status).toBe(409)

    const secondCashier = await signIn('cashier', 'cashier-two')
    expect(ok(await secondCashier.apiV2.registers({ id: register.id })['current-shift'].get()).id).toBe(opened.id)
    ok(await secondCashier.apiV2.shifts({ id: opened.id })['cash-entries'].post({ kind: 'cash_in', amountSatang: 1500, reason: 'เติมเงินทอน' }, idempotency()))
    ok(await cashier.apiV2.shifts({ id: opened.id })['cash-entries'].post({ kind: 'cash_out', amountSatang: 500, reason: 'ซื้อถุง' }, idempotency()))

    const closing = ok(await cashier.apiV2.shifts({ id: opened.id })['start-closing'].post({}, idempotency()))
    expect(closing).toMatchObject({ status: 'closing', closingRevision: 1, closingExpectedCashSatang: 11000 })
    expect((await secondCashier.apiV2.shifts({ id: opened.id })['cash-entries'].post({ kind: 'cash_in', amountSatang: 100, reason: 'ทดสอบ' }, idempotency())).status).toBe(409)

    const closed = ok(await cashier.apiV2.shifts({ id: opened.id }).close.post({
      closingRevision: 1,
      countedCashSatang: 10500,
      reason: 'เงินขาด 5 บาท',
    }, idempotency()))
    expect(closed).toMatchObject({ status: 'closed', cashDifferenceSatang: -500, closedById: cashier.user.id })
    expect((await cashier.apiV2.shifts({ id: opened.id })['cash-entries'].post({ kind: 'cash_in', amountSatang: 100, reason: 'หลังปิด' }, idempotency())).status).toBe(409)
  })

  test('requires a reason for a non-zero count difference and rejects stale closing revisions', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const opened = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency()))
    ok(await cashier.apiV2.shifts({ id: opened.id })['start-closing'].post({}, idempotency()))

    const missingReason = await cashier.apiV2.shifts({ id: opened.id }).close.post({ closingRevision: 1, countedCashSatang: 100 }, idempotency())
    expect(missingReason.status).toBe(400)
    expect(missingReason.error?.value).toMatchObject({ code: 'SHIFT_DIFFERENCE_REASON_REQUIRED' })

    ok(await cashier.apiV2.shifts({ id: opened.id })['cancel-closing'].post({ closingRevision: 1 }, idempotency()))
    const restarted = ok(await cashier.apiV2.shifts({ id: opened.id })['start-closing'].post({}, idempotency()))
    expect(restarted.closingRevision).toBe(2)
    const stale = await cashier.apiV2.shifts({ id: opened.id }).close.post({ closingRevision: 1, countedCashSatang: 0 }, idempotency())
    expect(stale.status).toBe(409)
    expect(stale.error?.value).toMatchObject({ code: 'SHIFT_CLOSING_REVISION_MISMATCH' })
  })

  test('blocks opening shifts when deployment mode remains legacy', async () => {
    Bun.env.CHECKOUT_MODE = 'legacy'
    const register = ok(await owner.apiV2.registers.get()).items[0]!

    const blocked = await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency())

    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'CHECKOUT_MODE_REQUIRED' })
  })

  test('keeps shifts activated if deployment config is changed back to legacy', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const shift = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency()))
    Bun.env.CHECKOUT_MODE = 'legacy'

    expect(ok(await cashier.apiV2.capabilities.get()).checkoutMode).toBe('shifts')
    const legacySale = await cashier.api.sales.post({ items: [{ productId: 1, quantity: 1 }], payments: [{ method: 'cash', amountSatang: 1 }] })
    expect(legacySale.status).toBe(404)
    const closing = ok(await cashier.apiV2.shifts({ id: shift.id })['start-closing'].post({}, idempotency()))
    expect(closing.status).toBe('closing')
  })

  test('replays an open-shift command once and rejects the same key with another body', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const key = crypto.randomUUID()
    const request = { registerId: register.id, openingCashSatang: 2500 }
    const options = { headers: { 'idempotency-key': key } }

    const first = ok(await cashier.apiV2.shifts.post(request, options))
    const replay = ok(await cashier.apiV2.shifts.post(request, options))
    expect(replay.id).toBe(first.id)

    const mismatch = await cashier.apiV2.shifts.post({ ...request, openingCashSatang: 3000 }, options)
    expect(mismatch.status).toBe(409)
    expect(mismatch.error?.value).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(ok(await owner.apiV2.shifts.get({ query: {} })).items).toHaveLength(1)
  })

  test('v2 checkout links the sale and records only net cash in the same shift', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const shift = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 1000 }, idempotency()))
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 2 })

    const checkoutOptions = idempotency()
    const request = {
      shiftId: shift.id,
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [{ method: 'cash' as const, amountSatang: 2000 }],
    }
    const sale = ok(await cashier.apiV2.sales.post(request, checkoutOptions))
    const replay = ok(await cashier.apiV2.sales.post(request, checkoutOptions))

    expect(sale).toMatchObject({ shiftId: shift.id, totalSatang: 1000, changeSatang: 1000 })
    expect(replay.id).toBe(sale.id)
    const entries = ok(await cashier.apiV2.shifts({ id: shift.id })['cash-entries'].get({ query: {} }))
    expect(entries.items.map((entry) => [entry.kind, entry.amountSatang])).toContainEqual(['cash_sale', 1000])
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(1)
  })

  test('pays an existing order into the selected shift and replays the same sale', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const shift = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency()))
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 3 })
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    const body = { shiftId: shift.id, payments: [{ method: 'cash' as const, amountSatang: 2500 }] }
    const options = idempotency()

    const sale = ok(await cashier.apiV2.orders({ id: order.id }).pay.post(body, options))
    const replay = ok(await cashier.apiV2.orders({ id: order.id }).pay.post(body, options))

    expect(sale).toMatchObject({ shiftId: shift.id, totalSatang: 2500 })
    expect(replay.id).toBe(sale.id)
    expect(ok(await cashier.api.orders({ id: order.id }).get())).toMatchObject({ status: 'paid', saleId: sale.id })
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(2)
  })

  test('voided cash sales require a one-time refund recorded from an open shift', async () => {
    const register = ok(await owner.apiV2.registers.get()).items[0]!
    const shift = ok(await cashier.apiV2.shifts.post({ registerId: register.id, openingCashSatang: 0 }, idempotency()))
    const tea = await seedProduct(owner, { priceSatang: 1000, stock: 2 })
    const sale = ok(await cashier.apiV2.sales.post({
      shiftId: shift.id,
      items: [{ productId: tea.id, quantity: 1 }],
      payments: [{ method: 'cash', amountSatang: 1000 }],
    }, idempotency()))
    ok(await owner.apiV2.sales({ id: sale.id }).void.post({ reason: 'ลูกค้าขอยกเลิก' }, idempotency()))

    const refundBody = { shiftId: shift.id, reason: 'คืนเงินลูกค้า' }
    const refundOptions = idempotency()
    const refund = ok(await owner.apiV2.sales({ id: sale.id })['cash-refund'].post(refundBody, refundOptions))
    const replay = ok(await owner.apiV2.sales({ id: sale.id })['cash-refund'].post(refundBody, refundOptions))
    expect(refund).toMatchObject({ shiftId: shift.id, saleId: sale.id, amountSatang: 1000 })
    expect(replay).toEqual(refund)
    expect(ok(await owner.apiV2.shifts({ id: shift.id })['cash-entries'].get({ query: {} })).items.map((entry) => entry.kind)).toContain('cash_refund')

    const secondAttempt = await owner.apiV2.sales({ id: sale.id })['cash-refund'].post(refundBody, idempotency())
    expect(secondAttempt.status).toBe(409)
    expect(secondAttempt.error?.value).toMatchObject({ code: 'SALE_ALREADY_REFUNDED' })
  })

  test('retires legacy v1 money commands after shifts mode is active', async () => {
    const response = await cashier.api.sales.post({
      items: [{ productId: 1, quantity: 1 }],
      payments: [{ method: 'cash', amountSatang: 1000 }],
    })

    expect(response.status).toBe(404)
    expect(response.error?.value).toMatchObject({ code: 'API_VERSION_RETIRED' })
  })
})
