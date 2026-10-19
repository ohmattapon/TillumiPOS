import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'

describe('dotsForPaperMm', () => {
  test('58mm maps to 384 dots and 80mm maps to 576 dots', async () => {
    const { dotsForPaperMm } = await import('./receipt-raster.domain')
    expect(dotsForPaperMm(58)).toBe(384)
    expect(dotsForPaperMm(80)).toBe(576)
  })

  test('unsupported width throws INVALID_PRINTER_SETTINGS', async () => {
    const { dotsForPaperMm } = await import('./receipt-raster.domain')
    expect(() => dotsForPaperMm(72)).toThrow(DomainError)
    try {
      dotsForPaperMm(72)
      expect.unreachable()
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_PRINTER_SETTINGS')
    }
  })
})

describe('buildRasterCommand', () => {
  test('8x8 all-black image emits GS v 0 header with packed bytes', async () => {
    const { buildRasterCommand } = await import('./receipt-raster.domain')
    const bits = new Array(64).fill(true)
    const out = buildRasterCommand(8, 8, bits)
    // GS v 0 m=0, xL=1 xH=0 (8 dots = 1 byte wide), yL=8 yH=0
    expect(Array.from(out.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 0x01, 0x00, 0x08, 0x00])
    // 8 rows of 0xFF
    expect(Array.from(out.slice(8))).toEqual(new Array(8).fill(0xff))
  })

  test('bit order is MSB-first: first pixel is the high bit', async () => {
    const { buildRasterCommand } = await import('./receipt-raster.domain')
    const bits = new Array(8).fill(false)
    bits[0] = true
    const out = buildRasterCommand(8, 1, bits)
    expect(out[8]).toBe(0x80)
  })

  test('width not divisible by 8 throws', async () => {
    const { buildRasterCommand } = await import('./receipt-raster.domain')
    expect(() => buildRasterCommand(7, 1, new Array(7).fill(false))).toThrow(DomainError)
  })

  test('bits length mismatch throws INVALID_RASTER', async () => {
    const { buildRasterCommand } = await import('./receipt-raster.domain')
    try {
      buildRasterCommand(8, 8, new Array(10).fill(false))
      expect.unreachable()
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_RASTER')
    }
  })
})

describe('buildCutCommand', () => {
  test('emits GS V B 0 partial cut', async () => {
    const { buildCutCommand } = await import('./receipt-raster.domain')
    expect(Array.from(buildCutCommand())).toEqual([0x1d, 0x56, 0x42, 0x00])
  })
})

describe('buildDrawerCommand', () => {
  test('default pin emits ESC p with 25ms timings', async () => {
    const { buildDrawerCommand } = await import('./receipt-raster.domain')
    expect(Array.from(buildDrawerCommand(0))).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
  })

  test('invalid pin throws', async () => {
    const { buildDrawerCommand } = await import('./receipt-raster.domain')
    expect(() => buildDrawerCommand(2)).toThrow(DomainError)
  })
})
