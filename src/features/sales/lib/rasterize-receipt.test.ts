import { describe, expect, test } from 'bun:test'
import { dotsForPaperMm } from '@pos/api/receipt-raster'
import { monoBitsFromCanvas, thresholdToBits } from './rasterize-receipt'

const pixel = (red: number, green: number, blue: number) => [red, green, blue, 255]

const canvasOf = (width: number, height: number, data: Uint8ClampedArray) =>
  ({
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data }) }),
  }) as unknown as HTMLCanvasElement

describe('thresholdToBits', () => {
  test('black is ink and white is paper', () => {
    const data = new Uint8ClampedArray([...pixel(0, 0, 0), ...pixel(255, 255, 255)])

    expect(thresholdToBits(data, 2, 1)).toEqual([true, false])
  })

  test('light-gray anti-aliasing stays ink so thin Thai marks survive', () => {
    const data = new Uint8ClampedArray(pixel(150, 150, 150))

    expect(thresholdToBits(data, 1, 1)).toEqual([true])
  })

  test('near-white stays paper', () => {
    const data = new Uint8ClampedArray(pixel(220, 220, 220))

    expect(thresholdToBits(data, 1, 1)).toEqual([false])
  })

  test('pixel data that does not match its dimensions throws', () => {
    expect(() => thresholdToBits(new Uint8ClampedArray(4), 2, 1)).toThrow()
  })
})

describe('monoBitsFromCanvas', () => {
  test('a canvas at the exact dot width passes through row by row', () => {
    const widthDots = dotsForPaperMm(80)
    const data = new Uint8ClampedArray([...pixel(0, 0, 0), ...pixel(255, 255, 255)])
    const canvas = canvasOf(2, 1, data)

    const bitmap = monoBitsFromCanvas(canvas, 2)

    expect(bitmap).toEqual({ widthDots: 2, heightDots: 1, bits: [true, false] })
    expect(widthDots).toBe(576)
  })

  test('a narrower canvas is padded white and centered', () => {
    const bitmap = monoBitsFromCanvas(canvasOf(2, 1, new Uint8ClampedArray([...pixel(0, 0, 0), ...pixel(0, 0, 0)])), 6)

    expect(bitmap.bits).toEqual([false, false, true, true, false, false])
  })

  test('a wider canvas is center-cropped, never stretched', () => {
    const row = [...pixel(255, 255, 255), ...pixel(0, 0, 0), ...pixel(0, 0, 0), ...pixel(255, 255, 255)]
    const bitmap = monoBitsFromCanvas(canvasOf(4, 1, new Uint8ClampedArray(row)), 2)

    expect(bitmap.bits).toEqual([true, true])
  })

  test.each([58, 80] as const)('paper %smm keeps the canvas height and hits its dot width', (paperMm) => {
    const widthDots = dotsForPaperMm(paperMm)
    const canvas = canvasOf(widthDots, 3, new Uint8ClampedArray(widthDots * 3 * 4).fill(255))

    const bitmap = monoBitsFromCanvas(canvas, widthDots)

    expect(bitmap.widthDots).toBe(widthDots)
    expect(bitmap.heightDots).toBe(3)
    expect(bitmap.bits).toHaveLength(widthDots * 3)
    expect(bitmap.bits.every((bit) => bit === false)).toBe(true)
  })

  test('an empty canvas throws', () => {
    expect(() => monoBitsFromCanvas(canvasOf(0, 0, new Uint8ClampedArray(0)), 384)).toThrow('Receipt image is empty')
  })

  test('a missing 2d context throws', () => {
    const canvas = { width: 2, height: 1, getContext: () => null } as unknown as HTMLCanvasElement

    expect(() => monoBitsFromCanvas(canvas, 2)).toThrow('Canvas 2d context is not available')
  })
})
