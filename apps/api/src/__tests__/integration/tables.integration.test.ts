import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const tables = () => owner.api.catalog.tables

describe('dining tables', () => {
  test('a new table gets a default place and size, and nothing open on it', async () => {
    const created = ok(await tables().post({ name: 'T1' }))

    expect(created).toEqual({
      id: expect.any(Number),
      branchId: 1,
      name: 'T1',
      zone: null,
      seats: 4,
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      sortOrder: 0,
      isActive: true,
      openOrders: 0,
      openTotalSatang: 0,
    })
  })

  test('a table is moved and resized, and the place survives a reload', async () => {
    const created = ok(await tables().post({ name: 'T1' }))

    ok(await tables()({ id: created.id }).patch({ x: 400, y: 300, width: 200, height: 100 }))

    const listed = ok(await tables().get()).items
    expect(listed[0]).toMatchObject({ x: 400, y: 300, width: 200, height: 100 })
  })

  test('a table off the floor or too small is refused', async () => {
    const created = ok(await tables().post({ name: 'T1' }))

    const off = await tables()({ id: created.id }).patch({ x: 990 })
    const small = await tables()({ id: created.id }).patch({ width: 10 })

    expect(off.error?.value).toMatchObject({ code: 'INVALID_TABLE' })
    expect(small.status).toBe(422)
  })

  test('names are unique within a branch', async () => {
    ok(await tables().post({ name: 'T1' }))

    const duplicate = await tables().post({ name: 'T1' })

    expect(duplicate.status).toBe(409)
    expect(duplicate.error?.value).toMatchObject({ code: 'DUPLICATE' })
  })

  test('only the owner changes tables; any signed-in user may read, anonymous may not', async () => {
    const cashier = await signIn('cashier')

    expect((await cashier.api.catalog.tables.post({ name: 'x' })).status).toBe(403)
    expect((await cashier.api.catalog.tables.get()).status).toBe(200)
    expect((await client().catalog.tables.get()).status).toBe(401)
  })

  test('what is open on a table shows on it, and a table with open orders cannot be closed', async () => {
    const table = ok(await tables().post({ name: 'T1' }))
    const tea = await seedProduct(owner, { priceSatang: 2500, stock: 10 })
    const order = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 2 }] }))

    expect(ok(await tables().get()).items[0]).toMatchObject({ openOrders: 1, openTotalSatang: 5000 })
    const refused = await tables()({ id: table.id }).patch({ isActive: false })
    expect(refused.status).toBe(409)
    expect(refused.error?.value).toMatchObject({ code: 'TABLE_HAS_OPEN_ORDERS' })

    ok(await owner.api.orders({ id: order.id }).cancel.post({ reason: 'ทดสอบ' }))
    expect(ok(await tables()({ id: table.id }).patch({ isActive: false })).isActive).toBe(false)
  })
})

describe('orders on tables', () => {
  const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]
  const seed = async () => {
    const table = ok(await owner.api.catalog.tables.post({ name: 'T1' }))
    const other = ok(await owner.api.catalog.tables.post({ name: 'T2' }))
    const tea = await seedProduct(owner, { name: 'ชา', priceSatang: 2500, stock: 20 })
    const cake = await seedProduct(owner, { name: 'เค้ก', priceSatang: 5700, stock: 20 })
    return { table, other, tea, cake }
  }

  test('an order opened on a table carries it, and moves to another table or to none', async () => {
    const { table, other } = await seed()
    const order = ok(await owner.api.orders.post({ tableId: table.id }))
    expect(order.tableId).toBe(table.id)

    expect(ok(await owner.api.orders({ id: order.id }).move.post({ tableId: other.id })).tableId).toBe(other.id)
    expect(ok(await owner.api.orders({ id: order.id }).move.post({ tableId: null })).tableId).toBeNull()
  })

  test('a closed table and an unknown table cannot be used', async () => {
    const { table } = await seed()
    ok(await owner.api.catalog.tables({ id: table.id }).patch({ isActive: false }))

    const closed = await owner.api.orders.post({ tableId: table.id })
    const unknown = await owner.api.orders.post({ tableId: 9999 })

    expect(closed.error?.value).toMatchObject({ code: 'TABLE_INACTIVE' })
    expect(unknown.error?.value).toMatchObject({ code: 'TABLE_NOT_FOUND' })
  })

  test('merging adds the same product, keeps the total, and the source is closed as merged', async () => {
    const { table, tea, cake } = await seed()
    const a = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 2 }] }))
    const b = ok(
      await owner.api.orders.post({
        tableId: table.id,
        items: [
          { productId: tea.id, quantity: 1 },
          { productId: cake.id, quantity: 1 },
        ],
      }),
    )

    const merged = ok(await owner.api.orders({ id: a.id }).merge.post({ sourceOrderId: b.id }))

    expect(merged.items.map((line) => [line.productName, line.quantity])).toEqual([
      ['ชา', 3],
      ['เค้ก', 1],
    ])
    expect(merged.subtotalSatang).toBe(3 * 2500 + 5700)
    const source = ok(await owner.api.orders({ id: b.id }).get())
    expect(source).toMatchObject({ status: 'merged', mergedIntoId: a.id, items: [] })
    expect(ok(await owner.api.catalog.tables.get()).items[0]).toMatchObject({ openOrders: 1 })

    const frozen = await owner.api.orders({ id: b.id }).items.post({ productId: tea.id, quantity: 1 })
    const paid = await owner.api.orders({ id: b.id }).pay.post({ payments: cash(100000) })
    expect(frozen.error?.value).toMatchObject({ code: 'ORDER_NOT_OPEN' })
    expect(paid.error?.value).toMatchObject({ code: 'ORDER_NOT_OPEN' })
  })

  test('merging in opposite directions at once ends with exactly one of them merged', async () => {
    const { table, tea } = await seed()
    const a = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 1 }] }))
    const b = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 1 }] }))

    const results = await Promise.all([
      owner.api.orders({ id: a.id }).merge.post({ sourceOrderId: b.id }),
      owner.api.orders({ id: b.id }).merge.post({ sourceOrderId: a.id }),
    ])

    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    const open = ok(await owner.api.orders.get({ query: { status: 'open' } })).items
    expect(open).toHaveLength(1)
    expect(open[0]!.items.map((line) => line.quantity)).toEqual([2])
  })

  test('an order cannot be merged into itself', async () => {
    const { table } = await seed()
    const a = ok(await owner.api.orders.post({ tableId: table.id }))

    const result = await owner.api.orders({ id: a.id }).merge.post({ sourceOrderId: a.id })

    expect(result.error?.value).toMatchObject({ code: 'ORDER_MERGE_SAME' })
  })

  test('splitting moves part of a line to a new order on the table, the totals add up, and each is paid on its own', async () => {
    const { table, tea } = await seed()
    const order = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 3 }] }))
    const lineId = order.items[0]!.lineId

    const created = ok(await owner.api.orders({ id: order.id }).split.post({ lines: [{ lineId, quantity: 2 }] }))
    const remaining = ok(await owner.api.orders({ id: order.id }).get())

    expect(created).toMatchObject({ tableId: table.id, status: 'open', subtotalSatang: 5000 })
    expect(remaining.subtotalSatang + created.subtotalSatang).toBe(7500)
    expect(ok(await owner.api.catalog.tables.get()).items[0]).toMatchObject({ openOrders: 2, openTotalSatang: 7500 })

    const first = ok(await owner.api.orders({ id: order.id }).pay.post({ payments: cash(2500) }))
    const second = ok(await owner.api.orders({ id: created.id }).pay.post({ payments: cash(5000) }))
    expect([first.totalSatang, second.totalSatang]).toEqual([2500, 5000])
  })

  test('splitting cannot take everything, more than there is, or a line of another order', async () => {
    const { table, tea } = await seed()
    const order = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 2 }] }))
    const mine = order.items[0]!.lineId
    const other = ok(await owner.api.orders.post({ tableId: table.id, items: [{ productId: tea.id, quantity: 1 }] }))

    const all = await owner.api.orders({ id: order.id }).split.post({ lines: [{ lineId: mine, quantity: 2 }] })
    const more = await owner.api.orders({ id: order.id }).split.post({ lines: [{ lineId: mine, quantity: 3 }] })
    const foreign = await owner.api.orders({ id: order.id }).split.post({
      lines: [{ lineId: other.items[0]!.lineId, quantity: 1 }],
    })

    expect(all.error?.value).toMatchObject({ code: 'ORDER_SPLIT_EMPTY' })
    expect(more.error?.value).toMatchObject({ code: 'ORDER_SPLIT_QUANTITY' })
    expect(foreign.error?.value).toMatchObject({ code: 'ORDER_ITEM_NOT_FOUND' })
    expect(ok(await owner.api.orders({ id: order.id }).get()).items[0]!.quantity).toBe(2)
  })
})
