import { z } from 'zod'

/** About 37cm at 203dpi: longer than any real receipt, short enough to bound one print. */
export const MAX_RASTER_HEIGHT_DOTS = 3000
const WIDTHS = [384, 576] as const

// What the till rendered (Task 3): row-major 1-bit pixels, `true` = black.
// The byte builder re-checks the size; this schema only keeps absurd payloads out.
export const printReceiptSchema = z
  .object({
    saleId: z.number().int().min(1),
    widthDots: z.union(WIDTHS.map((width) => z.literal(width))),
    heightDots: z.number().int().min(1).max(MAX_RASTER_HEIGHT_DOTS),
    bits: z.array(z.boolean()).max(WIDTHS[1] * MAX_RASTER_HEIGHT_DOTS),
    cut: z.boolean().default(true),
    kickDrawer: z.boolean().default(false),
  })
  .refine((value) => value.bits.length === value.widthDots * value.heightDots, {
    message: 'bits must hold exactly widthDots * heightDots pixels',
  })
