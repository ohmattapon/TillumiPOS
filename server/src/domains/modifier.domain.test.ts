import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import {
  lineKey,
  MAX_GROUP_SELECTIONS,
  ModifierGroupEntity,
  ModifierOptionEntity,
  resolveLineOptions,
  type ModifierGroupProps,
  type ModifierOptionProps,
} from './modifier.domain'

const group = (overrides: Partial<ModifierGroupProps> = {}) =>
  new ModifierGroupEntity({ id: 1, name: 'ระดับความหวาน', required: true, maxSelections: 1, sortOrder: 0, isActive: true, ...overrides })
const option = (overrides: Partial<ModifierOptionProps> = {}) =>
  new ModifierOptionEntity({ id: 10, groupId: 1, name: 'หวานน้อย', priceSatang: 0, costSatang: 0, sortOrder: 0, isActive: true, ...overrides })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('ModifierGroupEntity', () => {
  test('keeps a valid group and copies it with changes', () => {
    const changed = group().with({ name: 'ท็อปปิง', required: false, maxSelections: 3 })

    expect(changed.toSnapshot()).toEqual({ id: 1, name: 'ท็อปปิง', required: false, maxSelections: 3, sortOrder: 0, isActive: true })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['no selections allowed', { maxSelections: 0 }],
    ['more selections than the limit', { maxSelections: MAX_GROUP_SELECTIONS + 1 }],
    ['a fractional limit', { maxSelections: 1.5 }],
    ['a fractional sort order', { sortOrder: 0.5 }],
  ])('rejects %s', (_label, overrides) => {
    expect(codeOf(() => group(overrides as Partial<ModifierGroupProps>))).toBe('INVALID_MODIFIER')
  })
})

describe('ModifierOptionEntity', () => {
  test('keeps a free option and an option with a price and cost', () => {
    expect(option().priceSatang).toBe(0)
    expect(option({ priceSatang: 1000, costSatang: 400 }).with({ priceSatang: 1200 }).toSnapshot()).toMatchObject({
      priceSatang: 1200,
      costSatang: 400,
    })
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a negative price', { priceSatang: -1 }],
    ['a fractional price', { priceSatang: 0.5 }],
    ['a negative cost', { costSatang: -1 }],
  ])('rejects %s', (_label, overrides) => {
    expect(codeOf(() => option(overrides as Partial<ModifierOptionProps>))).toBe('INVALID_MODIFIER')
  })
})

describe('lineKey', () => {
  test('is the sorted ids, and empty without options', () => {
    expect(lineKey([])).toBe('')
    expect(lineKey([{ optionId: 21 }, { optionId: 10 }, { optionId: 20 }])).toBe('10-20-21')
  })
})

describe('resolveLineOptions', () => {
  const sweetness = { group: group(), options: [option({ id: 10 }), option({ id: 11, name: 'หวานมาก' })] }
  const toppings = {
    group: group({ id: 2, name: 'ท็อปปิง', required: false, maxSelections: 2 }),
    options: [
      option({ id: 20, groupId: 2, name: 'ไข่มุก', priceSatang: 1000, costSatang: 400 }),
      option({ id: 21, groupId: 2, name: 'วุ้น', priceSatang: 500, costSatang: 200 }),
      option({ id: 22, groupId: 2, name: 'ครีมชีส', priceSatang: 1500, costSatang: 700 }),
    ],
  }
  const groups = [sweetness, toppings]

  test('snapshots the chosen options in group order, with the price, cost and key', () => {
    const resolved = resolveLineOptions(groups, [21, 10, 20])

    expect(resolved.options.map((item) => item.name)).toEqual(['หวานน้อย', 'ไข่มุก', 'วุ้น'])
    expect(resolved.options[1]).toEqual({
      groupId: 2,
      groupName: 'ท็อปปิง',
      optionId: 20,
      name: 'ไข่มุก',
      priceSatang: 1000,
      costSatang: 400,
    })
    expect(resolved).toMatchObject({ priceSatang: 1500, costSatang: 600, key: '10-20-21' })
  })

  test('the order the ids are sent in does not change the result', () => {
    expect(resolveLineOptions(groups, [20, 10])).toEqual(resolveLineOptions(groups, [10, 20]))
  })

  test('an optional group may be left empty', () => {
    expect(resolveLineOptions(groups, [10])).toMatchObject({ priceSatang: 0, key: '10' })
  })

  test('a product without groups resolves to nothing', () => {
    expect(resolveLineOptions([], [])).toEqual({ options: [], priceSatang: 0, costSatang: 0, key: '' })
  })

  test('a required group needs a choice', () => {
    expect(codeOf(() => resolveLineOptions(groups, []))).toBe('MODIFIER_REQUIRED')
    expect(codeOf(() => resolveLineOptions(groups, [20]))).toBe('MODIFIER_REQUIRED')
  })

  test('cannot choose more than the group allows', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 11]))).toBe('MODIFIER_TOO_MANY')
    expect(codeOf(() => resolveLineOptions(groups, [10, 20, 21, 22]))).toBe('MODIFIER_TOO_MANY')
  })

  test('cannot choose the same option twice', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 10]))).toBe('MODIFIER_DUPLICATE')
  })

  test('an option that is not on this product is not available', () => {
    expect(codeOf(() => resolveLineOptions(groups, [10, 99]))).toBe('MODIFIER_NOT_AVAILABLE')
  })

  test('a deactivated option or an option of a deactivated group is not available', () => {
    const closedOption = { group: group({ required: false }), options: [option({ id: 10, isActive: false })] }
    const closedGroup = { group: group({ id: 2, isActive: false }), options: [option({ id: 30, groupId: 2 })] }

    expect(codeOf(() => resolveLineOptions([closedOption], [10]))).toBe('MODIFIER_NOT_AVAILABLE')
    expect(codeOf(() => resolveLineOptions([closedGroup], [30]))).toBe('MODIFIER_NOT_AVAILABLE')
  })

  test('a deactivated required group asks for nothing', () => {
    const closed = { group: group({ isActive: false }), options: [option({ id: 10 })] }

    expect(resolveLineOptions([closed], [])).toMatchObject({ options: [], key: '' })
  })

  test('carries the group name and limit in the error so the screen can say which group', () => {
    try {
      resolveLineOptions(groups, [])
    } catch (error) {
      expect(error).toMatchObject({ code: 'MODIFIER_REQUIRED', params: { group: 'ระดับความหวาน' } })
      return
    }
    throw new Error('expected a throw')
  })
})
