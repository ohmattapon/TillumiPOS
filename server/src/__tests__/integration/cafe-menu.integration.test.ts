import { beforeEach, describe, expect, test } from 'bun:test'
import type { AppliedCafeMenuResponse } from '../../modules/cafe-menu/adapters/controllers/schemas/cafe-menu.schema'
import { ok, resetDatabase, signIn, type Session } from '../../../test/harness'

let owner: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
})

/** The two drinks the apply tests use: one with both groups, one with sweetness only. */
const TICKED = ['CAFE-ESP-HOT', 'CAFE-TEA-ICE']

const apply = async (keys: readonly string[]) => await owner.api['cafe-menu'].post({ itemKeys: [...keys] })

describe('cafe menu', () => {
  test('the ticked items are created with the set price, no stock counting and their groups', async () => {
    const applied: AppliedCafeMenuResponse = ok(await apply(TICKED))

    expect(applied.added).toEqual({ categories: 2, products: 2, groups: 2, options: 7 })
    expect(applied.reused).toEqual({ categories: 0, groups: 0 })
    expect(applied.skipped).toEqual({ products: 0, items: [] })

    const categories = ok(await owner.api.catalog.categories.get()).items
    const coffee = categories.find((category) => category.name === 'กาแฟ')!
    const products = ok(await owner.api.catalog.products.get()).items
    const espresso = products.find((product) => product.sku === 'CAFE-ESP-HOT')!
    const tea = products.find((product) => product.sku === 'CAFE-TEA-ICE')!

    expect(espresso).toMatchObject({
      name: 'เอสเปรสโซ่ร้อน',
      priceSatang: 4500,
      categoryId: coffee.id,
      trackStock: false,
      isActive: true,
    })
    expect(tea).toMatchObject({ name: 'ชาไทยเย็น', priceSatang: 5500, trackStock: false, isActive: true })

    const groups = ok(await owner.api.catalog['modifier-groups'].get()).items
    const sweetness = groups.find((group) => group.name === 'ความหวาน')!
    const toppings = groups.find((group) => group.name === 'ท็อปปิ้ง')!

    // Every drink can be sold without a pick, and the till starts on หวานปกติ.
    expect(sweetness.required).toBe(false)
    expect(sweetness.options.filter((option) => option.isDefault).map((option) => option.name)).toEqual(['หวานปกติ'])
    expect(toppings.required).toBe(false)
    expect(toppings.options.map((option) => option.priceSatang)).toEqual([1000, 1500, 1000])
    expect(sweetness.productIds).toEqual([espresso.id, tea.id])
    expect(toppings.productIds).toEqual([espresso.id])
  })

  test('applying the same keys again skips every item and changes nothing', async () => {
    ok(await apply(TICKED))

    const again: AppliedCafeMenuResponse = ok(await apply(TICKED))

    expect(again.added).toEqual({ categories: 0, products: 0, groups: 0, options: 0 })
    // Nothing was created, so nothing was reused: a category or a group counts as reused only when an
    // item that is actually being created needs it (see the toReuse comment in cafe-menu.domain.ts).
    expect(again.reused).toEqual({ categories: 0, groups: 0 })
    expect(again.skipped.products).toBe(2)
    expect(again.skipped.items.map((item) => item.name)).toEqual(['เอสเปรสโซ่ร้อน', 'ชาไทยเย็น'])
    expect(ok(await owner.api.catalog.products.get()).total).toBe(2)
    expect(ok(await owner.api.catalog.categories.get()).items).toHaveLength(2)
  })

  test('a category that is already there is reused', async () => {
    const coffee = ok(await owner.api.catalog.categories.post({ name: 'กาแฟ' }))

    const applied: AppliedCafeMenuResponse = ok(await apply(['CAFE-ESP-HOT']))

    expect(applied.added.categories).toBe(0)
    expect(applied.reused).toEqual({ categories: 1, groups: 0 })

    const categories = ok(await owner.api.catalog.categories.get()).items
    expect(categories.map((category) => category.id)).toEqual([coffee.id])
    expect(ok(await owner.api.catalog.products.get()).items[0]?.categoryId).toBe(coffee.id)
  })

  test('an unknown key is rejected and writes nothing', async () => {
    const result = await owner.api['cafe-menu'].post({ itemKeys: ['NOPE-HOT'] })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_CAFE_MENU_ITEM' })
    expect(ok(await owner.api.catalog.products.get()).total).toBe(0)
    expect(ok(await owner.api.catalog.categories.get()).items).toHaveLength(0)
  })

  test('a cashier cannot apply the set', async () => {
    const cashier = await signIn('cashier')

    const result = await cashier.api['cafe-menu'].post({ itemKeys: TICKED })

    expect(result.status).toBe(403)
    expect(ok(await owner.api.catalog.products.get()).total).toBe(0)
    expect(ok(await owner.api.catalog.categories.get()).items).toHaveLength(0)
    expect(ok(await owner.api.catalog['modifier-groups'].get()).items).toHaveLength(0)
  })
})
