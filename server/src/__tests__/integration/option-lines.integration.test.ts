import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../test/kbank-server'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

const previousMode = Bun.env.CHECKOUT_MODE
let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  for (const name of KBANK_ENV_KEYS) delete Bun.env[name]
  if (previousMode === undefined) delete Bun.env.CHECKOUT_MODE
  else Bun.env.CHECKOUT_MODE = previousMode
})

const groups = () => owner.api.catalog['modifier-groups']

/** A tea with a sweetness to pick and up to two toppings, each with a cost the customer must never see. */
async function teaWithOptions() {
  const tea = await seedProduct(owner, { name: 'ชานม', priceSatang: 5000, costSatang: 2000, stock: 10 })
  const sweetness = ok(await groups().post({ name: 'ความหวาน', required: true }))
  const less = ok(await groups()({ id: sweetness.id }).options.post({ name: 'หวานน้อย' }))
  const toppings = ok(await groups().post({ name: 'ท็อปปิง', maxSelections: 2 }))
  const pearls = ok(await groups()({ id: toppings.id }).options.post({ name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }))
  const jelly = ok(await groups()({ id: toppings.id }).options.post({ name: 'วุ้น', priceSatang: 500, costSatang: 200 }))
  ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [sweetness.id, toppings.id] }))
  return { tea, options: [jelly.id, less.id, pearls.id] }
}

describe('lines with options', () => {
  test('a quote lists the chosen options without their cost, whatever order they were sent in', async () => {
    const { tea, options } = await teaWithOptions()

    const quote = ok(await cashier.api.quotes.post({ lines: [{ productId: tea.id, quantity: 1, options }] }))

    expect(quote.lines[0]!.options.map((option) => option.name).sort()).toEqual(['ไข่มุก', 'วุ้น', 'หวานน้อย'].sort())
    expect(quote.lines[0]!.options.every((option) => !('costSatang' in option))).toBe(true)
    expect(quote.totalSatang).toBe(6500)
  })

  test('an order with option lines can be priced, held by a QR, and shown as held', async () => {
    const { tea, options } = await teaWithOptions()
    const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 1, options }] }))
    const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))

    const qr = ok(await cashier.api.payments.qr.post({ amountSatang: quote.totalSatang, quoteId: quote.id }))

    const hold = ok(await cashier.apiV2.payments.qr.hold.get({ query: { orderId: order.id } }))
    expect(hold).toMatchObject({ id: qr.id, status: 'pending', amountSatang: 6500 })
  })

  test('a v2 sale shows the options without their cost', async () => {
    Bun.env.CHECKOUT_MODE = 'shifts'
    const { tea, options } = await teaWithOptions()
    const registerId = ok(await owner.apiV2.registers.get()).items[0]!.id
    const shift = ok(await cashier.apiV2.shifts.post({ registerId, openingCashSatang: 0 }, { headers: { 'idempotency-key': crypto.randomUUID() } }))

    const sale = ok(await cashier.apiV2.sales.post({
      shiftId: shift.id,
      items: [{ productId: tea.id, quantity: 1, options }],
      payments: [{ method: 'cash', amountSatang: 6500 }],
    }, { headers: { 'idempotency-key': crypto.randomUUID() } }))

    expect(sale.items[0]!.options).toHaveLength(3)
    expect(sale.items[0]!.options.every((option) => !('costSatang' in option))).toBe(true)
    expect('unitCostSatang' in sale.items[0]!).toBe(false)
  })
})
