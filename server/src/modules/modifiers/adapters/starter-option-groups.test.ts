import { beforeEach, describe, expect, test } from 'bun:test'
import { mockModifierRepository } from '../../../__tests__/mocks'
import { CAFE_MENU_OPTION_GROUPS } from '../../../domains/cafe-menu.domain'
import { ModifierGroupEntity } from '../../../domains/modifier.domain'
import { ModifierStarterOptionGroups } from './starter-option-groups'

let modifiers: ReturnType<typeof mockModifierRepository>
let starter: ModifierStarterOptionGroups

beforeEach(() => {
  modifiers = mockModifierRepository()
  modifiers.findAllGroups.mockResolvedValue([])
  let next = 0
  modifiers.createGroup.mockImplementation(async (group) => new ModifierGroupEntity({ ...group.toSnapshot(), id: ++next }))
  modifiers.createOption.mockImplementation(async (option) => option)
  starter = new ModifierStarterOptionGroups(modifiers)
})

describe('ModifierStarterOptionGroups', () => {
  test('a cafe gets every group of the set with its options, active, and the default option marked', async () => {
    await starter.addFor('cafe')

    expect(modifiers.createGroup.mock.calls.map((call) => call[0].name)).toEqual(CAFE_MENU_OPTION_GROUPS.map((group) => group.name))
    const sweetness = modifiers.createOption.mock.calls.map((call) => call[0]).filter((option) => option.groupId === 1)
    expect(sweetness.map((option) => option.name)).toEqual(['หวานปกติ', 'หวานน้อย', 'หวานมาก', 'ไม่ใส่น้ำตาล'])
    expect(sweetness.filter((option) => option.isDefault).map((option) => option.name)).toEqual(['หวานปกติ'])
    expect(modifiers.createGroup.mock.calls.every((call) => call[0].isActive)).toBe(true)
    expect(modifiers.createOption.mock.calls.every((call) => call[0].isActive)).toBe(true)
  })

  test('toppings add money and are optional', async () => {
    await starter.addFor('cafe')

    const toppings = modifiers.createGroup.mock.calls.map((call) => call[0]).find((group) => group.name === 'ท็อปปิ้ง')!
    expect(toppings.required).toBe(false)
    expect(toppings.maxSelections).toBe(3)
    const prices = modifiers.createOption.mock.calls.map((call) => call[0]).filter((option) => option.groupId === toppings.id || option.groupId === 2)
    expect(prices.every((option) => option.priceSatang > 0)).toBe(true)
  })

  test('a shop that is not a cafe is given nothing, and the catalogue is not even read for writing', async () => {
    for (const shopType of ['restaurant', 'retail', 'other'] as const) await starter.addFor(shopType)

    expect(modifiers.createGroup).not.toHaveBeenCalled()
    expect(modifiers.createOption).not.toHaveBeenCalled()
  })

  test('a group the shop already has is not made again', async () => {
    modifiers.findAllGroups.mockResolvedValue([{ group: new ModifierGroupEntity({ id: 9, name: 'ความหวาน', required: false, maxSelections: 1, sortOrder: 0, isActive: true }), options: [], productIds: [] }])

    await starter.addFor('cafe')

    expect(modifiers.createGroup.mock.calls.map((call) => call[0].name)).toEqual(['ท็อปปิ้ง'])
  })
})
