import { DomainError } from './errors/domain-error'

const invalidSettings = () => new DomainError('ขนาดกระดาษเครื่องพิมพ์ต้องเป็น 58 หรือ 80 มม.', 'INVALID_PRINTER_SETTINGS')
const invalidRaster = () => new DomainError('ข้อมูลภาพใบเสร็จไม่ถูกต้อง', 'INVALID_RASTER')
const invalidPin = () => new DomainError('ขาลิ้นชักต้องเป็น 0 หรือ 1', 'INVALID_PRINTER_SETTINGS')

/**
 * ESC/POS builders for LAN thermal printing (Thai as raster).
 * Pure: no I/O, no framework imports. Shared with the web via `@pos/api/receipt-raster`.
 *
 * Printers differ on Thai codepages, so the receipt is rendered to a 1-bit
 * image on the client and sent as `GS v 0` raster: every model that speaks
 * ESC/POS prints the same dots. 58mm = 384 dots, 80mm = 576 dots.
 */
export function dotsForPaperMm(paperMm: number): number {
  if (paperMm === 58) return 384
  if (paperMm === 80) return 576
  throw invalidSettings()
}

/**
 * Packs row-major 1-bit pixels (`true` = black) into a `GS v 0` raster command.
 * Bit order is MSB-first: the first pixel of each row is the high bit.
 */
export function buildRasterCommand(widthDots: number, heightDots: number, bits: readonly boolean[]): Uint8Array {
  if (!Number.isInteger(widthDots) || widthDots <= 0 || !Number.isInteger(heightDots) || heightDots <= 0)
    throw invalidRaster()
  if (widthDots % 8 !== 0) throw invalidRaster()
  if (bits.length !== widthDots * heightDots) throw invalidRaster()

  const bytesPerRow = widthDots / 8
  const data = new Uint8Array(heightDots * bytesPerRow)
  for (let row = 0; row < heightDots; row += 1) {
    for (let col = 0; col < widthDots; col += 1) {
      if (bits[row * widthDots + col] ?? false) {
        const at = row * bytesPerRow + (col >> 3)
        data[at] = (data[at] ?? 0) | (0x80 >> (col & 7))
      }
    }
  }

  const out = new Uint8Array(8 + data.length)
  out[0] = 0x1d
  out[1] = 0x76
  out[2] = 0x30
  out[3] = 0x00
  out[4] = bytesPerRow & 0xff
  out[5] = (bytesPerRow >> 8) & 0xff
  out[6] = heightDots & 0xff
  out[7] = (heightDots >> 8) & 0xff
  out.set(data, 8)
  return out
}

/** Partial cut with no extra feed (`GS V B 0`): the tear position stays under the cutter. */
export function buildCutCommand(): Uint8Array {
  return new Uint8Array([0x1d, 0x56, 0x42, 0x00])
}

/** Kicks the cash drawer (`ESC p m t1 t2`) with 25ms on/off pulses. */
export function buildDrawerCommand(pin: 0 | 1 = 0): Uint8Array {
  if (pin !== 0 && pin !== 1) throw invalidPin()
  return new Uint8Array([0x1b, 0x70, pin, 0x19, 0xfa])
}
