import type { ModifierGroup } from '@pos/api/types'
import { describe, expect, test } from 'bun:test'
import { chooseOptions, offeredGroups } from './options'

const group = (overrides: Partial<ModifierGroup>): ModifierGroup => ({
  id: 1,
  name: 'ความหวาน',
  required: true,
  maxSelections: 1,
  sortOrder: 0,
  isActive: true,
  productIds: [7],
  options: [
    { id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true },
    { id: 11, groupId: 1, name: 'หวานมาก', priceSatang: 0, costSatang: 0, sortOrder: 1, isActive: false },
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
