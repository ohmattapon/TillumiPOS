import { describe, expect, test } from 'bun:test'
import { MAX_SLIDE_IMAGE_BYTES, nextSortOrder, sortSlides, validateSlideFile } from './slides'

const file = (type: string, size: number) => ({ type, size })

describe('validateSlideFile', () => {
  test('accepts a JPEG, PNG or WebP photo within 5 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp'])
      expect(validateSlideFile(file(type, 1024))).toBeNull()
  })

  test('accepts a file of exactly 5 MB', () => {
    expect(validateSlideFile(file('image/jpeg', MAX_SLIDE_IMAGE_BYTES))).toBeNull()
  })

  test('rejects anything that is not a JPEG, PNG or WebP photo', () => {
    expect(validateSlideFile(file('image/gif', 1024))).toBe('type')
    expect(validateSlideFile(file('application/pdf', 1024))).toBe('type')
  })

  test('rejects a photo larger than 5 MB', () => {
    expect(validateSlideFile(file('image/png', MAX_SLIDE_IMAGE_BYTES + 1))).toBe('size')
  })
})

describe('sortSlides', () => {
  test('orders by sortOrder, breaking ties by id, without touching the input', () => {
    const input = [
      { id: 3, sortOrder: 1 },
      { id: 1, sortOrder: 0 },
      { id: 2, sortOrder: 1 },
    ]
    expect(sortSlides(input).map((slide) => slide.id)).toEqual([1, 2, 3])
    expect(input[0]).toEqual({ id: 3, sortOrder: 1 })
  })
})

describe('nextSortOrder', () => {
  test('starts at 0 when there are no slides', () => {
    expect(nextSortOrder([])).toBe(0)
  })

  test('appends after the highest order in use', () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 2 }])).toBe(3)
  })
})
