import type { ModifierGroup } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { chooseOptions, offeredGroups, preselectedOptionIds } from './options'

const group = (overrides: Partial<ModifierGroup>): ModifierGroup => ({
  id: 1,
  name: 'ความหวาน',
  required: true,
  maxSelections: 1,
  sortOrder: 0,
  isActive: true,
  productIds: [7],
  options: [
    { id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, isDefault: false },
    { id: 11, groupId: 1, name: 'หวานมาก', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: false, isDefault: false },
  ],
  ...overrides,
})

describe('offeredGroups', () => {
  test('keeps the active groups of the product that have an active option, leaving closed options out', () => {
    const groups = [
      group({ id: 1 }),
      group({ id: 2, productIds: [8] }),
      group({ id: 3, isActive: false }),
      group({ id: 4, options: [] }),
    ]

    const offered = offeredGroups(groups, 7)

    expect(offered.map((item) => item.id)).toEqual([1])
    expect(offered[0]!.options.map((option) => option.id)).toEqual([10])
  })
})

describe('preselectedOptionIds', () => {
  const sweetened = group({
    options: [
      { id: 10, groupId: 1, name: 'หวานปกติ', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, isDefault: true },
      { id: 12, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: true, isDefault: false },
    ],
  })
  const plain = group({
    id: 2,
    options: [
      { id: 20, groupId: 2, name: 'วิปครีม', priceSatang: 1000, costSatang: 0, sortOrder: 0, isActive: true, isDefault: false },
    ],
  })

  test('starts with the default of every group that has one, in group order', () => {
    expect(preselectedOptionIds(offeredGroups([sweetened, plain], 7))).toEqual([10])
  })

  test('starts with nothing when no group has a default', () => {
    expect(preselectedOptionIds(offeredGroups([plain], 7))).toEqual([])
  })

  test('the default alone is a complete choice, so the confirm button is enabled at once', () => {
    const offered = offeredGroups([sweetened], 7)

    expect(chooseOptions(offered, preselectedOptionIds(offered))).toMatchObject({ key: '10', priceSatang: 0 })
  })
})

describe('chooseOptions', () => {
  const offered = offeredGroups([group({})], 7)

  test('a valid choice is resolved with its price', () => {
    expect(chooseOptions(offered, [10])).toMatchObject({ key: '10', priceSatang: 0 })
  })

  test('a choice that breaks a rule is null, so the dialog can keep its button disabled', () => {
    expect(chooseOptions(offered, [])).toBeNull()
    expect(chooseOptions(offered, [99])).toBeNull()
  })
})
