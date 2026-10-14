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
