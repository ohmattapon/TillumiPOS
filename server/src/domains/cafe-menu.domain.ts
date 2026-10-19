/**
 * The starter drinks a shop can add in one go. Names and prices are data (Thai product names), not
 * display text, and everything here is plain, so the server and the web share this file through
 * `@pos/api/cafe-menu` and neither can disagree about what the set contains.
 *
 * Nothing in this file writes, reads a clock or touches a database: it says what the set is, and
 * which parts of it a shop is still missing.
 */

import type { ShopType } from './shop-settings.domain'

export interface CafeMenuCategory {
  /** Stable id of the category inside the set; items point at it. */
  key: string
  name: string
  sortOrder: number
}

export interface CafeMenuOption {
  name: string
  /** Added to the drink's price, satang. Never negative: an option can only add money. */
  priceSatang: number
  costSatang: number
  sortOrder: number
  /** What the till starts with; at most one option of a group carries it. */
  isDefault: boolean
}

export interface CafeMenuOptionGroup {
  key: string
  name: string
  required: boolean
  maxSelections: number
  sortOrder: number
  options: readonly CafeMenuOption[]
}

export interface CafeMenuItem {
  /** Also the SKU the product is created with, and the key a client asks for it by. */
  key: string
  name: string
  categoryKey: string
  priceSatang: number
  optionGroupKeys: readonly string[]
}

export const CAFE_MENU_CATEGORIES: readonly CafeMenuCategory[] = [
  { key: 'coffee', name: 'กาแฟ', sortOrder: 0 },
  { key: 'tea', name: 'ชาและโกโก้', sortOrder: 1 },
]

export const CAFE_MENU_OPTION_GROUPS: readonly CafeMenuOptionGroup[] = [
  {
    key: 'sweetness',
    name: 'ความหวาน',
    required: false,
    maxSelections: 1,
    sortOrder: 0,
    options: [
      { name: 'หวานปกติ', priceSatang: 0, costSatang: 0, sortOrder: 0, isDefault: true },
      { name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 1, isDefault: false },
      { name: 'หวานมาก', priceSatang: 0, costSatang: 0, sortOrder: 2, isDefault: false },
      { name: 'ไม่ใส่น้ำตาล', priceSatang: 0, costSatang: 0, sortOrder: 3, isDefault: false },
    ],
  },
  {
    key: 'toppings',
    name: 'ท็อปปิ้ง',
    required: false,
    maxSelections: 3,
    sortOrder: 1,
    options: [
      { name: 'วิปครีม', priceSatang: 1000, costSatang: 0, sortOrder: 0, isDefault: false },
      { name: 'ช็อตเอสเพรสโซ่เพิ่ม', priceSatang: 1500, costSatang: 0, sortOrder: 1, isDefault: false },
      { name: 'ไซรัปคาราเมล', priceSatang: 1000, costSatang: 0, sortOrder: 2, isDefault: false },
    ],
  },
]

const COFFEE_GROUPS = ['sweetness', 'toppings'] as const
const TEA_GROUPS = ['sweetness'] as const

export const CAFE_MENU_ITEMS: readonly CafeMenuItem[] = [
  { key: 'CAFE-ESP-HOT', name: 'เอสเปรสโซ่ร้อน', categoryKey: 'coffee', priceSatang: 4500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-AME-HOT', name: 'อเมริกาโน่ร้อน', categoryKey: 'coffee', priceSatang: 4500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-AME-ICE', name: 'อเมริกาโน่เย็น', categoryKey: 'coffee', priceSatang: 5500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-LAT-HOT', name: 'ลาเต้ร้อน', categoryKey: 'coffee', priceSatang: 5500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-LAT-ICE', name: 'ลาเต้เย็น', categoryKey: 'coffee', priceSatang: 6500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-CAP-HOT', name: 'คาปูชิโน่ร้อน', categoryKey: 'coffee', priceSatang: 5500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-CAP-ICE', name: 'คาปูชิโน่เย็น', categoryKey: 'coffee', priceSatang: 6500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-MOC-HOT', name: 'มอคค่าร้อน', categoryKey: 'coffee', priceSatang: 6000, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-MOC-ICE', name: 'มอคค่าเย็น', categoryKey: 'coffee', priceSatang: 7000, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-CAM-HOT', name: 'คาราเมลมัคคิอาโตร้อน', categoryKey: 'coffee', priceSatang: 6500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-CAM-ICE', name: 'คาราเมลมัคคิอาโตเย็น', categoryKey: 'coffee', priceSatang: 7500, optionGroupKeys: COFFEE_GROUPS },
  { key: 'CAFE-TEA-HOT', name: 'ชาไทยร้อน', categoryKey: 'tea', priceSatang: 4500, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-TEA-ICE', name: 'ชาไทยเย็น', categoryKey: 'tea', priceSatang: 5500, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-GRN-HOT', name: 'ชาเขียวร้อน', categoryKey: 'tea', priceSatang: 4500, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-GRN-ICE', name: 'ชาเขียวเย็น', categoryKey: 'tea', priceSatang: 5500, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-LEM-ICE', name: 'ชามะนาวเย็น', categoryKey: 'tea', priceSatang: 5000, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-MAT-HOT', name: 'มัทฉะลาเต้ร้อน', categoryKey: 'tea', priceSatang: 6000, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-MAT-ICE', name: 'มัทฉะลาเต้เย็น', categoryKey: 'tea', priceSatang: 7000, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-COC-HOT', name: 'โกโก้ร้อน', categoryKey: 'tea', priceSatang: 5000, optionGroupKeys: TEA_GROUPS },
  { key: 'CAFE-COC-ICE', name: 'โกโก้เย็น', categoryKey: 'tea', priceSatang: 6000, optionGroupKeys: TEA_GROUPS },
]

/** The catalogue a shop already has, read once and matched in memory. */
export interface CafeMenuExisting {
  categoryNames: readonly string[]
  groupNames: readonly string[]
  /** The SKUs and names of every product, active or not. */
  products: readonly { sku: string; name: string }[]
}

export interface CafeMenuPlan {
  toCreate: {
    categories: CafeMenuCategory[]
    groups: CafeMenuOptionGroup[]
    items: CafeMenuItem[]
  }
  /** Categories and groups the shop already has and the created items will be attached to. */
  toReuse: {
    categories: CafeMenuCategory[]
    groups: CafeMenuOptionGroup[]
  }
  toSkip: CafeMenuItem[]
  /** Keys that were asked for but are not part of the set. */
  unknown: string[]
}

const normalize = (value: string) => value.trim().toLowerCase()

/** How the set matches what a shop already has: by name, ignoring case and surrounding spaces. */
export const sameCafeMenuName = (a: string, b: string) => normalize(a) === normalize(b)

export function cafeMenuItem(key: string): CafeMenuItem | undefined {
  return CAFE_MENU_ITEMS.find((item) => item.key === key)
}

/** The categories the given items sit in, in set order. */
export function cafeMenuCategoriesFor(items: readonly CafeMenuItem[]): CafeMenuCategory[] {
  const wanted = new Set(items.map((item) => item.categoryKey))
  return CAFE_MENU_CATEGORIES.filter((category) => wanted.has(category.key))
}

/** The groups the given items ask about, in set order. */
export function cafeMenuGroupsFor(items: readonly CafeMenuItem[]): CafeMenuOptionGroup[] {
  const wanted = new Set(items.flatMap((item) => [...item.optionGroupKeys]))
  return CAFE_MENU_OPTION_GROUPS.filter((group) => wanted.has(group.key))
}

/**
 * What the set would add and what it would leave alone. The one rule for add-or-skip, shared by the
 * use case that creates and the dialog that previews it: a category or a group the shop already has
 * is reused by name, and an item whose SKU or name is already taken is skipped, never overwritten.
 */
export function planCafeMenu(keys: readonly string[], existing: CafeMenuExisting): CafeMenuPlan {
  const asked = [...new Set(keys)]
  const selected = CAFE_MENU_ITEMS.filter((item) => asked.includes(item.key))

  const categoryNames = new Set(existing.categoryNames.map(normalize))
  const groupNames = new Set(existing.groupNames.map(normalize))
  const skus = new Set(existing.products.map((product) => normalize(product.sku)))
  const names = new Set(existing.products.map((product) => normalize(product.name)))
  const taken = (item: CafeMenuItem) => skus.has(normalize(item.key)) || names.has(normalize(item.name))

  const items = selected.filter((item) => !taken(item))
  const categories = cafeMenuCategoriesFor(items)
  const groups = cafeMenuGroupsFor(items)

  return {
    toCreate: {
      categories: categories.filter((category) => !categoryNames.has(normalize(category.name))),
      groups: groups.filter((group) => !groupNames.has(normalize(group.name))),
      items,
    },
    toReuse: {
      categories: categories.filter((category) => categoryNames.has(normalize(category.name))),
      groups: groups.filter((group) => groupNames.has(normalize(group.name))),
    },
    toSkip: selected.filter(taken),
    unknown: asked.filter((key) => !cafeMenuItem(key)),
  }
}

/**
 * The option groups a shop of this kind has from its first day, before it has added a single drink: a
 * cafe is asked about sweetness and toppings on nearly every order, so those are ready to be attached to
 * its products. A group the shop already has (matched by name) is left alone.
 */
export function starterOptionGroupsFor(shopType: ShopType, existingGroupNames: readonly string[]): CafeMenuOptionGroup[] {
  if (shopType !== 'cafe') return []
  const taken = new Set(existingGroupNames.map(normalize))
  return CAFE_MENU_OPTION_GROUPS.filter((group) => !taken.has(normalize(group.name)))
}
