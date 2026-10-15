import { LAYOUT_HEIGHT, LAYOUT_WIDTH, MIN_TABLE_SIZE } from '@pos/api/dining-table'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** A distance on a canvas of `canvasPixels` across a layout of `layoutUnits`, in whole layout units. */
export const pixelsToUnits = (pixels: number, canvasPixels: number, layoutUnits: number) =>
  Math.round((pixels * layoutUnits) / canvasPixels)

/** The table moved by a distance, held inside the floor. */
export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    ...rect,
    x: clamp(Math.round(rect.x + dx), 0, LAYOUT_WIDTH - rect.width),
    y: clamp(Math.round(rect.y + dy), 0, LAYOUT_HEIGHT - rect.height),
  }
}

/** The table resized from its bottom right corner, never below the minimum and never off the floor. */
export function resizeRect(rect: Rect, dWidth: number, dHeight: number): Rect {
  return {
    ...rect,
    width: clamp(Math.round(rect.width + dWidth), MIN_TABLE_SIZE, LAYOUT_WIDTH - rect.x),
    height: clamp(Math.round(rect.height + dHeight), MIN_TABLE_SIZE, LAYOUT_HEIGHT - rect.y),
  }
}
