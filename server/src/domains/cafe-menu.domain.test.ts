import { describe, expect, test } from 'bun:test'
import {
  CAFE_MENU_CATEGORIES,
  CAFE_MENU_ITEMS,
  CAFE_MENU_OPTION_GROUPS,
  cafeMenuItem,
  planCafeMenu,
  type CafeMenuExisting,
} from './cafe-menu.domain'

const nothing = (): CafeMenuExisting => ({ categoryNames: [], groupNames: [], products: [] })

describe('the set', () => {
  test('every item points at a category and at groups that are in the set', () => {
    const categoryKeys = CAFE_MENU_CATEGORIES.map((category) => category.key)
    const groupKeys = CAFE_MENU_OPTION_GROUPS.map((group) => group.key)

    for (const item of CAFE_MENU_ITEMS) {
      expect(categoryKeys).toContain(item.categoryKey)
      for (const key of item.optionGroupKeys) expect(groupKeys).toContain(key)
      expect(cafeMenuItem(item.key)).toBe(item)
    }
  })

  test('SKUs are unique, fit the product rule, and no item is free', () => {
    const keys = CAFE_MENU_ITEMS.map((item) => item.key)

    expect(new Set(keys).size).toBe(keys.length)
    for (const item of CAFE_MENU_ITEMS) {
      expect(item.key.length).toBeGreaterThanOrEqual(1)
      expect(item.key.length).toBeLessThanOrEqual(64)
      expect(item.name.length).toBeGreaterThanOrEqual(1)
      expect(item.priceSatang).toBeGreaterThan(0)
    }
  })

  test('an unknown key is not part of the set', () => {
    expect(cafeMenuItem('NOPE')).toBeUndefined()
    expect(cafeMenuItem('cafe-ame-hot')).toBeUndefined()
  })

  test('sweetness carries exactly one default and every group at most one', () => {
    const sweetness = CAFE_MENU_OPTION_GROUPS.find((group) => group.key === 'sweetness')!

    expect(sweetness.options.filter((option) => option.isDefault).map((option) => option.name)).toEqual(['หวานปกติ'])
    for (const group of CAFE_MENU_OPTION_GROUPS)
      expect(group.options.filter((option) => option.isDefault).length).toBeLessThanOrEqual(1)
  })

  test('every group asks for a number of choices the domain allows, and no option ever discounts', () => {
    for (const group of CAFE_MENU_OPTION_GROUPS) {
      expect(group.maxSelections).toBeGreaterThanOrEqual(1)
      expect(group.maxSelections).toBeLessThanOrEqual(20)
      for (const option of group.options) expect(option.priceSatang).toBeGreaterThanOrEqual(0)
    }
  })

  test('drinks are split hot and cold, so a tile always shows the price it sells for', () => {
    const names = CAFE_MENU_ITEMS.map((item) => item.name)

    expect(names).toContain('อเมริกาโน่ร้อน')
    expect(names).toContain('อเมริกาโน่เย็น')
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('planCafeMenu', () => {
  test('adds the whole set when nothing exists', () => {
    const plan = planCafeMenu(
      CAFE_MENU_ITEMS.map((item) => item.key),
      nothing(),
    )

    expect(plan.toCreate.categories.map((category) => category.name)).toEqual(['กาแฟ', 'ชาและโกโก้'])
    expect(plan.toCreate.groups.map((group) => group.name)).toEqual(['ความหวาน', 'ท็อปปิ้ง'])
    expect(plan.toCreate.items).toHaveLength(CAFE_MENU_ITEMS.length)
    expect(plan.toReuse).toEqual({ categories: [], groups: [] })
    expect(plan.toSkip).toEqual([])
    expect(plan.unknown).toEqual([])
  })

  test('skips an item whose SKU is already taken', () => {
    const plan = planCafeMenu(['CAFE-AME-HOT'], {
      categoryNames: [],
      groupNames: [],
      products: [{ sku: 'cafe-ame-hot', name: 'อะไรก็ได้' }],
    })

    expect(plan.toCreate.items).toEqual([])
    expect(plan.toCreate.categories).toEqual([])
    expect(plan.toCreate.groups).toEqual([])
    expect(plan.toSkip.map((item) => item.key)).toEqual(['CAFE-AME-HOT'])
  })

  test('skips an item whose name is already taken, whatever the case and the spacing', () => {
    const plan = planCafeMenu(['CAFE-AME-HOT'], {
      categoryNames: [],
      groupNames: [],
      products: [{ sku: 'X-1', name: '  อเมริกาโน่ร้อน ' }],
    })

    expect(plan.toSkip.map((item) => item.name)).toEqual(['อเมริกาโน่ร้อน'])
    expect(plan.toCreate.items).toEqual([])
  })

  test('reuses a category and a group the shop already has, by name', () => {
    const plan = planCafeMenu(['CAFE-AME-HOT'], { categoryNames: ['กาแฟ'], groupNames: ['ความหวาน'], products: [] })

    expect(plan.toReuse.categories.map((category) => category.name)).toEqual(['กาแฟ'])
    expect(plan.toReuse.groups.map((group) => group.name)).toEqual(['ความหวาน'])
    expect(plan.toCreate.categories).toEqual([])
    expect(plan.toCreate.groups.map((group) => group.name)).toEqual(['ท็อปปิ้ง'])
    expect(plan.toCreate.items.map((item) => item.key)).toEqual(['CAFE-AME-HOT'])
  })

  test('creates only the categories and groups the ticked items need', () => {
    const plan = planCafeMenu(['CAFE-AME-HOT', 'CAFE-TEA-ICE'], { categoryNames: ['กาแฟ'], groupNames: [], products: [] })

    expect(plan.toCreate.categories.map((category) => category.name)).toEqual(['ชาและโกโก้'])
    expect(plan.toCreate.groups.map((group) => group.name)).toEqual(['ความหวาน', 'ท็อปปิ้ง'])
    expect(plan.toReuse.categories.map((category) => category.name)).toEqual(['กาแฟ'])
  })

  test('counts a mixed run: added, skipped and unknown', () => {
    const plan = planCafeMenu(['CAFE-AME-HOT', 'CAFE-LAT-ICE', 'CAFE-TEA-HOT', 'NOPE'], {
      categoryNames: ['กาแฟ'],
      groupNames: [],
      products: [{ sku: 'CAFE-LAT-ICE', name: 'ลาเต้เย็น' }],
    })

    expect(plan.toCreate.items.map((item) => item.key)).toEqual(['CAFE-AME-HOT', 'CAFE-TEA-HOT'])
    expect(plan.toSkip.map((item) => item.key)).toEqual(['CAFE-LAT-ICE'])
    expect(plan.unknown).toEqual(['NOPE'])
    expect(plan.toCreate.categories.map((category) => category.name)).toEqual(['ชาและโกโก้'])
    expect(plan.toReuse.categories.map((category) => category.name)).toEqual(['กาแฟ'])
    expect(plan.toCreate.groups.map((group) => group.name)).toEqual(['ความหวาน', 'ท็อปปิ้ง'])
  })

  test('a key asked for twice is one item, and nothing asked for adds nothing', () => {
    expect(planCafeMenu(['CAFE-AME-HOT', 'CAFE-AME-HOT'], nothing()).toCreate.items).toHaveLength(1)
    expect(planCafeMenu([], nothing())).toMatchObject({
      toCreate: { categories: [], groups: [], items: [] },
      toReuse: { categories: [], groups: [] },
      toSkip: [],
      unknown: [],
    })
  })

  test('a skipped item does not drag its category or its groups in', () => {
    const plan = planCafeMenu(['CAFE-TEA-HOT'], {
      categoryNames: [],
      groupNames: [],
      products: [{ sku: 'CAFE-TEA-HOT', name: 'ชาไทยร้อน' }],
    })

    expect(plan.toCreate.categories).toEqual([])
    expect(plan.toCreate.groups).toEqual([])
    expect(plan.toReuse).toEqual({ categories: [], groups: [] })
  })
})
