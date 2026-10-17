import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
const key = () => ({ headers: { 'idempotency-key': crypto.randomUUID() } })
let owner: Awaited<ReturnType<typeof signIn>>
let cashier: Awaited<ReturnType<typeof signIn>>
let registerId: number
let shiftId: number

beforeEach(async () => {
  Bun.env.CHECKOUT_MODE = 'shifts'
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
  registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
  shiftId = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 10_000 }, key())).id
})

afterEach(() => {
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

const shift = (api = cashier.apiV2) => api.shifts({ id: shiftId })
const summaryOf = async () => ok(await shift().summary.get())
const sell = (productId: number, payments: { method: 'cash' | 'promptpay' | 'card'; amountSatang: number }[], quantity = 1) =>
  cashier.apiV2.sales.post({ shiftId, items: [{ productId, quantity }], payments }, key())

describe('the report of a shift', () => {
  test('an open shift is worked out as of now: sales, tenders, change and the drawer', async () => {
    const tea = await seedProduct(owner, { priceSatang: 75_000, stock: 10 })
    // 750.00 paid with 1,000.00 cash: 250.00 change.
    ok(await sell(tea.id, [{ method: 'cash', amountSatang: 100_000 }]))
    // 750.00 paid 600.00 cash + 150.00 card.
    ok(await sell(tea.id, [{ method: 'cash', amountSatang: 60_000 }, { method: 'card', amountSatang: 15_000 }]))
    ok(await shift()['cash-entries'].post({ kind: 'cash_in', amountSatang: 5_000, reason: 'เติมเงินทอน' }, key()))
    ok(await shift()['cash-entries'].post({ kind: 'cash_out', amountSatang: 2_000, reason: 'ซื้อถุง' }, key()))

    const report = await summaryOf()

    expect(report).toMatchObject({ frozen: false, capturedAt: null, voidedAfterCutoff: { count: 0, amountSatang: 0 } })
    expect(report.summary).toEqual({
      saleCount: 2,
      grossSalesSatang: 150_000,
      voidedCount: 0,
      voidedSatang: 0,
      netSalesSatang: 150_000,
      changeSatang: 25_000,
      tendered: [
        { method: 'cash', amountSatang: 160_000 },
        { method: 'card', amountSatang: 15_000 },
      ],
      // Cash handed over (1,600.00) minus change (250.00).
      cashSaleSatang: 135_000,
      cashInSatang: 5_000,
      cashOutSatang: 2_000,
      cashRefundSatang: 0,
      openingCashSatang: 10_000,
      expectedCashSatang: 148_000,
    })
  })

  test('is frozen when counting starts, and agrees with the cash the count is checked against', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1_000, stock: 10 })
    ok(await sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }]))

    const closing = ok(await shift()['start-closing'].post({}, key()))
    const report = await summaryOf()

    expect(report.frozen).toBe(true)
    expect(report.capturedAt).toEqual(closing.closingStartedAt)
    expect(report.summary.expectedCashSatang).toBe(closing.closingExpectedCashSatang!)
    expect(report.summary).toMatchObject({ saleCount: 1, grossSalesSatang: 1_000, expectedCashSatang: 11_000 })
  })

  test('a sale voided after the shift is closed is shown beside the frozen report, never inside it', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1_000, stock: 10 })
    const kept = ok(await sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }]))
    const later = ok(await sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }]))
    ok(await owner.apiV2.sales({ id: kept.id }).void.post({ reason: 'ก่อนปิดกะ' }, key()))

    const closing = ok(await shift()['start-closing'].post({}, key()))
    ok(await shift().close.post({ closingRevision: closing.closingRevision, countedCashSatang: 12_000 }, key()))
    const atClose = await summaryOf()
    expect(atClose.summary).toMatchObject({ saleCount: 2, grossSalesSatang: 2_000, voidedCount: 1, voidedSatang: 1_000, netSalesSatang: 1_000 })

    // The next day the owner voids another bill of this closed shift.
    ok(await owner.apiV2.sales({ id: later.id }).void.post({ reason: 'ลูกค้าคืนของ' }, key()))
    const afterwards = await summaryOf()

    expect(afterwards.summary).toEqual(atClose.summary)
    expect(afterwards.capturedAt).toEqual(atClose.capturedAt)
    expect(afterwards.voidedAfterCutoff).toEqual({ count: 1, amountSatang: 1_000 })
  })

  test('cancelling the count drops the frozen report: the shift sells again and is worked out live', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1_000, stock: 10 })
    const closing = ok(await shift()['start-closing'].post({}, key()))
    ok(await shift()['cancel-closing'].post({ closingRevision: closing.closingRevision }, key()))

    ok(await sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }]))
    const report = await summaryOf()

    expect(report.frozen).toBe(false)
    expect(report.summary).toMatchObject({ saleCount: 1, expectedCashSatang: 11_000 })
  })

  test('a void takes no cash out of the drawer until the refund is recorded', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1_000, stock: 10 })
    const sale = ok(await sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }]))
    ok(await owner.apiV2.sales({ id: sale.id }).void.post({ reason: 'คิดเงินผิด' }, key()))
    expect((await summaryOf()).summary).toMatchObject({ voidedSatang: 1_000, cashRefundSatang: 0, expectedCashSatang: 11_000 })

    ok(await owner.apiV2.sales({ id: sale.id })['cash-refund'].post({ shiftId, reason: 'คืนเงินลูกค้า' }, key()))

    expect((await summaryOf()).summary).toMatchObject({ cashRefundSatang: 1_000, expectedCashSatang: 10_000 })
  })

  test("another branch's shift is not found, and anyone in the branch may read it", async () => {
    expect(ok(await owner.apiV2.shifts({ id: shiftId }).summary.get()).frozen).toBe(false)
    expect((await cashier.apiV2.shifts({ id: 9999 }).summary.get()).status).toBe(404)
  })
})

describe('history', () => {
  test('lists closed shifts with their count result, filtered by status and register, newest first, in pages', async () => {
    const closing = ok(await shift()['start-closing'].post({}, key()))
    ok(await shift().close.post({ closingRevision: closing.closingRevision, countedCashSatang: 9_500, reason: 'เงินขาด' }, key()))
    const second = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key()))

    const closed = ok(await cashier.apiV2.shifts.get({ query: { status: 'closed' } }))
    expect(closed.total).toBe(1)
    expect(closed.items[0]).toMatchObject({ id: shiftId, cashDifferenceSatang: -500, differenceReason: 'เงินขาด', countedCashSatang: 9_500 })

    const all = ok(await cashier.apiV2.shifts.get({ query: { registerId, limit: 1, offset: 0 } }))
    expect(all.total).toBe(2)
    expect(all.items.map((item) => item.id)).toEqual([second.id])
    const nextPage = ok(await cashier.apiV2.shifts.get({ query: { registerId, limit: 1, offset: 1 } }))
    expect(nextPage.items.map((item) => item.id)).toEqual([shiftId])
  })
})

describe('races', () => {
  test('checkout against "start counting": every sale is either in the frozen report or refused', async () => {
    const tea = await seedProduct(owner, { priceSatang: 1_000, stock: 50 })

    const [closing, ...sales] = await Promise.all([
      shift()['start-closing'].post({}, key()),
      ...Array.from({ length: 12 }, () => sell(tea.id, [{ method: 'cash', amountSatang: 1_000 }])),
    ])

    ok(closing)
    const recorded = sales.filter((result) => !result.error).length
    for (const refused of sales.filter((result) => result.error)) {
      expect(refused.status).toBe(409)
      expect(refused.error?.value).toMatchObject({ code: 'SHIFT_NOT_OPEN' })
    }
    const report = await summaryOf()
    // Nothing slipped in after the cutoff, and nothing that committed before it is missing.
    expect(report.summary.saleCount).toBe(recorded)
    expect(report.summary.expectedCashSatang).toBe(10_000 + recorded * 1_000)
    expect(report.summary.expectedCashSatang).toBe(closing.data!.closingExpectedCashSatang!)
    // A refused sale took no stock.
    expect(ok(await owner.api.catalog.products({ id: tea.id }).get()).stockQty).toBe(50 - recorded)
  })

  test('two people closing the same count: one closes, the other is told it is no longer being counted', async () => {
    const closing = ok(await shift()['start-closing'].post({}, key()))
    const body = { closingRevision: closing.closingRevision, countedCashSatang: 10_000 }

    const results = await Promise.all([shift().close.post(body, key()), shift(owner.apiV2).close.post(body, key())])

    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.find((result) => result.error)?.status).toBe(409)
  })

  test('the currency cannot change while a shift is open, and can once every shift is closed', async () => {
    const blocked = await owner.api.settings.patch({ currency: 'USD' })
    expect(blocked.status).toBe(409)
    expect(blocked.error?.value).toMatchObject({ code: 'SHIFT_CURRENCY_CHANGE_BLOCKED' })

    const closing = ok(await shift()['start-closing'].post({}, key()))
    ok(await shift().close.post({ closingRevision: closing.closingRevision, countedCashSatang: 10_000 }, key()))

    expect(ok(await owner.api.settings.patch({ currency: 'USD' })).currency).toBe('USD')
  })

  test('opening a shift against a currency change: the shift never ends up in a currency the shop left', async () => {
    const closing = ok(await shift()['start-closing'].post({}, key()))
    ok(await shift().close.post({ closingRevision: closing.closingRevision, countedCashSatang: 10_000 }, key()))

    const [opened, changed] = await Promise.all([
      cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, key()),
      owner.api.settings.patch({ currency: 'USD' }),
    ])

    // Whichever went first, the two agree: either the shift opened first and blocked the change,
    // or the change went first and the shift carries the new currency.
    const currency = ok(await owner.api.settings.get()).currency
    if (changed.error) {
      expect(changed.error.value).toMatchObject({ code: 'SHIFT_CURRENCY_CHANGE_BLOCKED' })
      expect(currency).toBe('THB')
    }
    expect(ok(opened).currency).toBe(currency)
  })
})
