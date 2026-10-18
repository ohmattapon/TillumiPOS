import { describe, expect, test } from 'bun:test'
import { filterItems, nextActiveIndex } from './combobox'

const items = [
  { label: 'Cola Zero', hint: 'SKU-001' },
  { label: 'น้ำเปล่า', hint: 'SKU-002' },
  { label: 'ขนมปัง' },
]

describe('filterItems', () => {
  test('no words keeps everything, in order, as a copy', () => {
    const kept = filterItems(items, '   ')

    expect(kept).toEqual(items)
    expect(kept).not.toBe(items)
  })

  test('matches part of a label, ignoring case', () => {
    expect(filterItems(items, 'cOLA').map((item) => item.label)).toEqual(['Cola Zero'])
    expect(filterItems(items, 'น้ำ').map((item) => item.label)).toEqual(['น้ำเปล่า'])
  })

  test('matches the hint too', () => {
    expect(filterItems(items, 'sku-002').map((item) => item.label)).toEqual(['น้ำเปล่า'])
  })

  test('every word must match, in any order', () => {
    expect(filterItems(items, 'zero cola').map((item) => item.label)).toEqual(['Cola Zero'])
    expect(filterItems(items, 'cola น้ำ')).toEqual([])
  })

  test('an item without a hint is still searched by its label', () => {
    expect(filterItems(items, 'ขนม').map((item) => item.label)).toEqual(['ขนมปัง'])
  })
})

describe('nextActiveIndex', () => {
  test('arrow down moves on and wraps to the top', () => {
    expect(nextActiveIndex(0, 3, 'ArrowDown')).toBe(1)
    expect(nextActiveIndex(2, 3, 'ArrowDown')).toBe(0)
  })

  test('arrow down from nothing highlighted lands on the first row', () => {
    expect(nextActiveIndex(-1, 3, 'ArrowDown')).toBe(0)
  })

  test('arrow up moves back and wraps to the bottom, also from nothing highlighted', () => {
    expect(nextActiveIndex(2, 3, 'ArrowUp')).toBe(1)
    expect(nextActiveIndex(0, 3, 'ArrowUp')).toBe(2)
    expect(nextActiveIndex(-1, 3, 'ArrowUp')).toBe(2)
  })

  test('home and end jump to the ends', () => {
    expect(nextActiveIndex(1, 4, 'Home')).toBe(0)
    expect(nextActiveIndex(1, 4, 'End')).toBe(3)
  })

  test('an empty list highlights nothing', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const) expect(nextActiveIndex(0, 0, key)).toBe(-1)
  })
})
