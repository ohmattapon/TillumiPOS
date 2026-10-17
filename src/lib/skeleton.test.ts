import { describe, expect, test } from 'bun:test'
import { barWidth } from './skeleton'

describe('barWidth', () => {
  test('gives neighbouring lines different widths', () => {
    expect(barWidth(0)).not.toBe(barWidth(1))
    expect(barWidth(1)).not.toBe(barWidth(2))
  })

  test('repeats after the last width', () => {
    expect(barWidth(5)).toBe(barWidth(0))
    expect(barWidth(12)).toBe(barWidth(2))
  })

  test('stays on a real width for any index, including negative ones', () => {
    for (const index of [-7, -1, 0, 3, 99]) expect(barWidth(index)).toMatch(/^w-/)
  })
})
