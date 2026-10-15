import { describe, expect, test } from 'bun:test'
import { CATEGORY_TONES, categoryColor } from './category-color'

describe('categoryColor', () => {
  test('gives the first categories different tones in order', () => {
    expect(categoryColor(1)).toBe('var(--category-1)')
    expect(categoryColor(2)).toBe('var(--category-2)')
    expect(categoryColor(CATEGORY_TONES)).toBe(`var(--category-${CATEGORY_TONES})`)
  })

  test('wraps around after the last tone', () => {
    expect(categoryColor(CATEGORY_TONES + 1)).toBe('var(--category-1)')
    expect(categoryColor(CATEGORY_TONES * 3 + 2)).toBe('var(--category-2)')
  })

  test('always lands on a defined tone, even for an id of zero or below', () => {
    for (const id of [0, -1, -9]) expect(categoryColor(id)).toMatch(/^var\(--category-[1-8]\)$/)
  })
})
