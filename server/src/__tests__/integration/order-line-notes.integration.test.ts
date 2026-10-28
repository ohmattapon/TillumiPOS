import { beforeEach, describe, expect, test } from 'bun:test'
import { ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
const stockOf = async (id: number) => ok(await owner.api.catalog.products({ id }).get()).stockQty

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

  test('a plain unit added next to a noted line is its own line', async () => {
    const { order, lineId } = await orderWithOneLine()
    const productId = order.items[0]!.productId

    ok(await owner.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: 'หวานน้อย' }))
    const added = ok(await owner.api.orders({ id: order.id }).items.post({ productId, quantity: 1 }))

    expect(added.items.map((item) => [item.quantity, item.note])).toEqual([
      [1, 'หวานน้อย'],
      [1, null],
    ])
  })

  test('two lines of one product are paid as one sale line at the first price', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const order = ok(await owner.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))

    ok(await owner.api.orders({ id: order.id }).lines({ lineId: order.items[0]!.lineId }).note.patch({ note: 'หวานน้อย' }))
    ok(await owner.api.catalog.products({ id: tea.id }).patch({ priceSatang: 3000 }))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 }))

    const sale = ok(await owner.api.orders({ id: order.id }).pay.post({ payments: cash(5000) }))

    expect(sale.totalSatang).toBe(5000)
    expect(sale.items.map((item) => [item.quantity, item.unitPriceSatang])).toEqual([[2, 2500]])
    expect(await stockOf(tea.id)).toBe(8)
  })

  test('editing a note to match another line merges them', async () => {
    const { order, lineId } = await orderWithOneLine()
    const productId = order.items[0]!.productId

    ok(await owner.api.orders({ id: order.id }).lines({ lineId }).note.patch({ note: 'หวานน้อย' }))
    const added = ok(await owner.api.orders({ id: order.id }).items.post({ productId, quantity: 2 }))

    const merged = ok(
      await owner.api
        .orders({ id: order.id })
        .lines({ lineId: added.items[1]!.lineId })
        .note.patch({ note: 'หวานน้อย' }),
    )

    expect(merged.items.map((item) => [item.lineId, item.quantity, item.note])).toEqual([[lineId, 3, 'หวานน้อย']])
  })

  test('merging bills keeps both notes', async () => {
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const target = ok(await owner.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))
    const source = ok(await owner.api.orders.post({ items: [{ productId: tea.id, quantity: 1 }] }))

    ok(await owner.api.orders({ id: target.id }).lines({ lineId: target.items[0]!.lineId }).note.patch({ note: 'หวานน้อย' }))
    ok(await owner.api.orders({ id: source.id }).lines({ lineId: source.items[0]!.lineId }).note.patch({ note: 'เผ็ด' }))

    const merged = ok(await owner.api.orders({ id: target.id }).merge.post({ sourceOrderId: source.id }))

    expect(merged.items.map((item) => [item.quantity, item.note])).toEqual([
      [1, 'หวานน้อย'],
      [1, 'เผ็ด'],
    ])
  })
})
