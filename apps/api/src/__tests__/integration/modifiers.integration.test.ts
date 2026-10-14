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
