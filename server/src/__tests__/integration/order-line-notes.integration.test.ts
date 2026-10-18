import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

async function orderWithOneLine() {
  const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
  const order = ok(await owner.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
  return { order, lineId: order.items[0]!.lineId }
}

describe('a note on an order line', () => {
  test('is saved on the line, and cleared with null', async () => {
    const { order, lineId } = await orderWithOneLine()

    const noted = ok(await owner.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: 'หวานน้อย' }))
    const cleared = ok(await owner.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: null }))

    expect(noted.items[0]!.note).toBe('หวานน้อย')
    expect(cleared.items[0]!.note).toBeNull()
  })

  test('a line of another order is not found', async () => {
    const { order } = await orderWithOneLine()

    const attempt = await owner.api.orders({ id: order.id }).lines({ lineId: 99999 }).note.patch({ note: 'x' })

    expect(attempt.status).toBe(404)
  })
})
