import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import {
  DiningTableEntity,
  LAYOUT_HEIGHT,
  LAYOUT_WIDTH,
  MIN_TABLE_SIZE,
  type DiningTableProps,
} from './dining-table.domain'

const table = (overrides: Partial<DiningTableProps> = {}) =>
  new DiningTableEntity({
    id: 1,
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
    ...overrides,
  })

const codeOf = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return (error as DomainError).code
  }
  return undefined
}

describe('DiningTableEntity', () => {
  test('keeps a valid table and copies it with changes', () => {
    const moved = table().with({ x: 300, y: 200, zone: 'ระเบียง', isActive: false })

    expect(moved.toSnapshot()).toEqual({
      id: 1,
      branchId: 1,
      name: 'T1',
      zone: 'ระเบียง',
      seats: 4,
      x: 300,
      y: 200,
      width: 120,
      height: 80,
      sortOrder: 0,
      isActive: false,
    })
  })

  test('a table may touch the edges of the floor', () => {
    expect(table({ x: 0, y: 0 }).x).toBe(0)
    expect(table({ x: LAYOUT_WIDTH - 120, y: LAYOUT_HEIGHT - 80 }).y).toBe(LAYOUT_HEIGHT - 80)
  })

  test.each([
    ['an empty name', { name: '' }],
    ['a name over 50 characters', { name: 'x'.repeat(51) }],
    ['an empty zone', { zone: '' }],
    ['no seats', { seats: 0 }],
    ['100 seats', { seats: 100 }],
    ['a fractional seat count', { seats: 2.5 }],
    ['a fractional position', { x: 10.5 }],
    ['a negative position', { y: -1 }],
    ['past the right edge', { x: LAYOUT_WIDTH - 119 }],
    ['past the bottom edge', { y: LAYOUT_HEIGHT - 79 }],
    ['a width under the minimum', { width: MIN_TABLE_SIZE - 1 }],
    ['a height over the floor', { height: LAYOUT_HEIGHT + 1, y: 0 }],
    ['a fractional sort order', { sortOrder: 0.5 }],
  ])('rejects %s', (_label, overrides) => {
    expect(codeOf(() => table(overrides as Partial<DiningTableProps>))).toBe('INVALID_TABLE')
  })

  test('a change that puts the table off the floor is rejected', () => {
    expect(codeOf(() => table().with({ x: 990 }))).toBe('INVALID_TABLE')
  })
})
