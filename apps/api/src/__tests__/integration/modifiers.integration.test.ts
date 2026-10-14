import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

const groups = () => owner.api.catalog['modifier-groups']

describe('modifier groups and options', () => {
  test('a new group is optional, single choice and has no options or products', async () => {
    const created = ok(await groups().post({ name: 'ระดับความหวาน' }))

    expect(created).toEqual({
      id: expect.any(Number),
      name: 'ระดับความหวาน',
      required: false,
      maxSelections: 1,
      sortOrder: 0,
      isActive: true,
      options: [],
      productIds: [],
    })
  })

  test('options carry a price and cost, and are listed with their group in order', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง', maxSelections: 3 }))
    ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น', priceSatang: 500, costSatang: 200, sortOrder: 2 }))
    ok(await groups()({ id: group.id }).options.post({ name: 'ไข่มุก', priceSatang: 1000, costSatang: 400, sortOrder: 1 }))

    const listed = ok(await groups().get()).items

    expect(listed).toHaveLength(1)
    expect(listed[0]!.options.map((option) => [option.name, option.priceSatang, option.costSatang])).toEqual([
      ['ไข่มุก', 1000, 400],
      ['วุ้น', 500, 200],
    ])
  })

  test('an option is deactivated, not deleted, and a price can change', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))
    const option = ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น', priceSatang: 500 }))

    const changed = ok(await owner.api.catalog['modifier-options']({ id: option.id }).patch({ priceSatang: 700, isActive: false }))

    expect(changed).toMatchObject({ id: option.id, name: 'วุ้น', priceSatang: 700, isActive: false })
    expect(ok(await groups().get()).items[0]!.options).toHaveLength(1)
  })

  test('duplicate names conflict, in a group and between groups', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))
    ok(await groups()({ id: group.id }).options.post({ name: 'วุ้น' }))

    const sameGroup = await groups().post({ name: 'ท็อปปิง' })
    const sameOption = await groups()({ id: group.id }).options.post({ name: 'วุ้น' })

    expect(sameGroup.status).toBe(409)
    expect(sameOption.status).toBe(409)
    expect(sameOption.error?.value).toMatchObject({ code: 'DUPLICATE' })
  })

  test('a negative price and a limit above 20 are refused', async () => {
    const group = ok(await groups().post({ name: 'ท็อปปิง' }))

    expect((await groups()({ id: group.id }).options.post({ name: 'x', priceSatang: -1 })).status).toBe(422)
    expect((await groups().post({ name: 'y', maxSelections: 21 })).status).toBe(422)
  })

  test('only the owner changes them; any signed-in user may read, anonymous may not', async () => {
    const cashier = await signIn('cashier')

    expect((await cashier.api.catalog['modifier-groups'].post({ name: 'x' })).status).toBe(403)
    expect((await cashier.api.catalog['modifier-groups'].get()).status).toBe(200)
    expect((await client().catalog['modifier-groups'].get()).status).toBe(401)
  })

  test('updating or adding to an unknown group is not found', async () => {
    const patched = await groups()({ id: 9999 }).patch({ name: 'ผี' })
    const added = await groups()({ id: 9999 }).options.post({ name: 'ผี' })

    expect(patched.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
    expect(added.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
  })
})

describe('offering groups on a product', () => {
  test('the groups of a product are replaced as a whole and show on the group as productIds', async () => {
    const tea = await seedProduct(owner, { name: 'ชา' })
    const sweetness = ok(await groups().post({ name: 'ความหวาน' }))
    const toppings = ok(await groups().post({ name: 'ท็อปปิง' }))

    const first = ok(
      await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [toppings.id, sweetness.id] }),
    )
    expect(first.groupIds).toEqual([toppings.id, sweetness.id])
    expect(ok(await groups().get()).items.map((group) => group.productIds)).toEqual([[tea.id], [tea.id]])

    ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [sweetness.id] }))
    const byName = Object.fromEntries(ok(await groups().get()).items.map((group) => [group.name, group.productIds]))
    expect(byName).toEqual({ ความหวาน: [tea.id], ท็อปปิง: [] })
  })

  test('an unknown product or group is not found', async () => {
    const tea = await seedProduct(owner)

    const noProduct = await owner.api.catalog.products({ id: 9999 })['modifier-groups'].put({ groupIds: [] })
    const noGroup = await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [9999] })

    expect(noProduct.error?.value).toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    expect(noGroup.error?.value).toMatchObject({ code: 'MODIFIER_GROUP_NOT_FOUND' })
  })
})

const setup = async () => {
  const tea = await seedProduct(owner, { name: 'ชานม', priceSatang: 5000, costSatang: 2000, stock: 10 })
  const sweetness = ok(await owner.api.catalog['modifier-groups'].post({ name: 'ความหวาน', required: true }))
  const less = ok(await owner.api.catalog['modifier-groups']({ id: sweetness.id }).options.post({ name: 'หวานน้อย' }))
  const more = ok(await owner.api.catalog['modifier-groups']({ id: sweetness.id }).options.post({ name: 'หวานมาก' }))
  const toppings = ok(await owner.api.catalog['modifier-groups'].post({ name: 'ท็อปปิง', maxSelections: 2 }))
  const pearls = ok(
    await owner.api.catalog['modifier-groups']({ id: toppings.id }).options.post({ name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }),
  )
  ok(await owner.api.catalog.products({ id: tea.id })['modifier-groups'].put({ groupIds: [sweetness.id, toppings.id] }))
  const order = ok(await owner.api.orders.post({}))
  return { tea, sweetness, less, more, toppings, pearls, order }
}

describe('orders with options', () => {
  test('the same product with other options is another line, priced with its options', async () => {
    const { tea, less, more, pearls, order } = await setup()

    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 2, options: [more.id] }))
    // Same choice as the first line, ids in another order: joins it.
    const after = ok(
      await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [pearls.id, less.id] }),
    )

    expect(after.items.map((line) => [line.options.map((option) => option.name), line.quantity, line.unitPriceSatang])).toEqual([
      [['หวานน้อย', 'ไข่มุก'], 2, 6000],
      [['หวานมาก'], 2, 5000],
    ])
    expect(after.subtotalSatang).toBe(2 * 6000 + 2 * 5000)
    expect(JSON.stringify(after)).not.toContain('costSatang')
  })

  test('a line keeps its id when other lines change, and is edited by that id', async () => {
    const { tea, less, more, order } = await setup()
    const first = ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id] }))
    const second = ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [more.id] }))
    const [firstLine, secondLine] = second.items
    expect(firstLine!.lineId).toBe(first.items[0]!.lineId)

    const changed = ok(await owner.api.orders({ id: order.id }).lines({ lineId: secondLine!.lineId }).patch({ quantity: 4 }))
    expect(changed.items.map((line) => [line.lineId, line.quantity])).toEqual([
      [firstLine!.lineId, 1],
      [secondLine!.lineId, 4],
    ])

    const removed = ok(await owner.api.orders({ id: order.id }).lines({ lineId: firstLine!.lineId }).delete())
    expect(removed.items.map((line) => line.lineId)).toEqual([secondLine!.lineId])
  })

  test('the product-id routes of v1 still work on a line without options', async () => {
    const plain = await seedProduct(owner, { name: 'น้ำเปล่า', priceSatang: 1000, stock: 5 })
    const order = ok(await owner.api.orders.post({}))
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: plain.id, quantity: 1 }))

    const changed = ok(await owner.api.orders({ id: order.id }).items({ productId: plain.id }).patch({ quantity: 3 }))

    expect(changed.items.map((line) => line.quantity)).toEqual([3])
  })

  test('a v1 client that sends no options for a product with a required group is told which group', async () => {
    const { tea, order } = await setup()

    const refused = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1 })

    expect(refused.status).toBe(400)
    expect(refused.error?.value).toMatchObject({ code: 'MODIFIER_REQUIRED', detail: 'กรุณาเลือก "ความหวาน"' })
  })

  test('refuses too many, repeated and foreign options', async () => {
    const { tea, less, more, order } = await setup()
    const other = await seedProduct(owner, { name: 'อื่น', stock: 1 })

    const tooMany = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, more.id] })
    const repeated = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, less.id] })
    const foreign = await owner.api.orders({ id: order.id }).items.post({ productId: other.id, quantity: 1, options: [less.id] })

    expect(tooMany.error?.value).toMatchObject({ code: 'MODIFIER_TOO_MANY' })
    expect(repeated.error?.value).toMatchObject({ code: 'MODIFIER_DUPLICATE' })
    expect(foreign.error?.value).toMatchObject({ code: 'MODIFIER_NOT_AVAILABLE' })
  })

  test('an option deactivated later cannot be added again, but a line already ordered keeps its price', async () => {
    const { tea, less, pearls, order } = await setup()
    const line = ok(
      await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] }),
    )
    ok(await owner.api.catalog['modifier-options']({ id: pearls.id }).patch({ isActive: false, priceSatang: 5000 }))

    const again = await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id, pearls.id] })
    expect(again.error?.value).toMatchObject({ code: 'MODIFIER_NOT_AVAILABLE' })
    expect(ok(await owner.api.orders({ id: order.id }).get()).items[0]).toMatchObject({
      lineId: line.items[0]!.lineId,
      unitPriceSatang: 6000,
    })
  })

  test("another order's line id is not found and changes nothing", async () => {
    const { tea, less, order } = await setup()
    ok(await owner.api.orders({ id: order.id }).items.post({ productId: tea.id, quantity: 1, options: [less.id] }))
    const mine = ok(await owner.api.orders.post({}))
    const theirs = ok(await owner.api.orders({ id: order.id }).get()).items[0]!

    const result = await owner.api.orders({ id: mine.id }).lines({ lineId: theirs.lineId }).patch({ quantity: 9 })

    expect(result.error?.value).toMatchObject({ code: 'ORDER_ITEM_NOT_FOUND' })
    expect(ok(await owner.api.orders({ id: order.id }).get()).items[0]!.quantity).toBe(1)
  })
})
