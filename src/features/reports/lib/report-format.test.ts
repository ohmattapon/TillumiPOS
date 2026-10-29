import { describe, expect, test } from 'bun:test'
import { categoryLabel, formatBasisPoints, marginBp } from './report-format'

const labels = { none: 'No category', deleted: 'Deleted category' }

describe('categoryLabel', () => {
  test('a null id is no category', () => {
    expect(categoryLabel({ categoryId: null, name: null }, labels)).toBe('No category')
  })
  test('an id with no name is a deleted category', () => {
    expect(categoryLabel({ categoryId: 9, name: null }, labels)).toBe('Deleted category')
  })
  test('an id with a name shows the name', () => {
    expect(categoryLabel({ categoryId: 9, name: 'Drinks' }, labels)).toBe('Drinks')
  })
})

describe('marginBp', () => {
  test('profit over net sales in basis points, rounded half away from zero', () => {
    expect(marginBp(250, 1000)).toBe(2500)
    expect(marginBp(1, 3)).toBe(3333)
    expect(marginBp(-1, 3)).toBe(-3333)
  })
  test('null when there were no net sales', () => {
    expect(marginBp(0, 0)).toBeNull()
  })
})

describe('formatBasisPoints', () => {
  test('one decimal place and a percent sign', () => {
    expect(formatBasisPoints(1240)).toBe('12.4%')
    expect(formatBasisPoints(0)).toBe('0.0%')
    expect(formatBasisPoints(3333)).toBe('33.3%')
  })
  test('the sign is left to the caller', () => {
    expect(formatBasisPoints(-1240)).toBe('12.4%')
  })
})
