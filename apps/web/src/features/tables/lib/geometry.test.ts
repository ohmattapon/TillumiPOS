import { describe, expect, test } from 'bun:test'
import { LAYOUT_HEIGHT, LAYOUT_WIDTH, MIN_TABLE_SIZE } from '@pos/api/dining-table'
import { moveRect, pixelsToUnits, resizeRect } from './geometry'

const rect = { x: 100, y: 100, width: 120, height: 80 }

describe('pixelsToUnits', () => {
  test('scales a drag on a canvas of any size to layout units, in whole numbers', () => {
    expect(pixelsToUnits(50, 500, LAYOUT_WIDTH)).toBe(100)
    expect(pixelsToUnits(1, 3, LAYOUT_WIDTH)).toBe(333)
    expect(pixelsToUnits(-50, 500, LAYOUT_WIDTH)).toBe(-100)
  })
})

describe('moveRect', () => {
  test('moves by the given units', () => {
    expect(moveRect(rect, 30, -20)).toEqual({ x: 130, y: 80, width: 120, height: 80 })
  })

  test('cannot leave the floor on any side', () => {
    expect(moveRect(rect, -500, -500)).toMatchObject({ x: 0, y: 0 })
    expect(moveRect(rect, 5000, 5000)).toMatchObject({ x: LAYOUT_WIDTH - 120, y: LAYOUT_HEIGHT - 80 })
  })
})

describe('resizeRect', () => {
  test('changes the size, keeping the corner where it is', () => {
    expect(resizeRect(rect, 40, 20)).toEqual({ x: 100, y: 100, width: 160, height: 100 })
  })

  test('cannot get smaller than the minimum or run off the floor', () => {
    expect(resizeRect(rect, -500, -500)).toMatchObject({ width: MIN_TABLE_SIZE, height: MIN_TABLE_SIZE })
    expect(resizeRect(rect, 5000, 5000)).toMatchObject({ width: LAYOUT_WIDTH - 100, height: LAYOUT_HEIGHT - 100 })
  })
})
