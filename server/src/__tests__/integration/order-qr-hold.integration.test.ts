import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { fakeKbank, KBANK_ENV_KEYS } from '../../../test/kbank-server'
import { clientV2, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let cashier: Session
let owner: Session

beforeEach(async () => {
  await resetDatabase()
  fakeKbank.reset()
  fakeKbank.enableIn(Bun.env)
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

afterEach(() => {
  for (const name of KBANK_ENV_KEYS) delete Bun.env[name]
})

/** An open order whose price is pinned by a quote; the QR then holds that quote. */
async function pricedOrder() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const order = ok(await cashier.api.orders.post({ items: [{ productId: tea.id, quantity: 2 }] }))
  const quote = ok(await cashier.api.quotes.post({ orderId: order.id }))
  return { order, quote }
}

/** The API answers "no hold" with an empty body, which the client hands back as an empty string. */
const holdOf = async (orderId: number) => ok(await cashier.apiV2.payments.qr.hold.get({ query: { orderId } })) || null

describe('the QR that holds an open order', () => {
  test('an order nobody is paying for has no hold', async () => {
    const { order } = await pricedOrder()

    expect(await holdOf(order.id)).toBeNull()
  })

  test('a pending QR reserved by the order is shown, and a cancelled one is not', async () => {
    const { order, quote } = await pricedOrder()
    const qr = ok(await cashier.api.payments.qr.post({ amountSatang: quote.totalSatang, quoteId: quote.id }))

    const hold = await holdOf(order.id)

    expect(hold).toMatchObject({ id: qr.id, status: 'pending', amountSatang: quote.totalSatang })
    ok(await cashier.api.payments.qr({ id: qr.id }).cancel.post())
    expect(await holdOf(order.id)).toBeNull()
  })

  test('only a signed-in user can ask', async () => {
    const { order } = await pricedOrder()

    expect((await clientV2().payments.qr.hold.get({ query: { orderId: order.id } })).status).toBe(401)
  })
})
