import { t } from 'elysia'
import { MAX_RASTER_HEIGHT_DOTS } from '../../../applications/schemas/printer-schemas'

const MAX_BITS = 576 * MAX_RASTER_HEIGHT_DOTS

export const receiptPrinterSchemas = {
  printBody: t.Object({
    saleId: t.Integer({ minimum: 1 }),
    widthDots: t.Union([t.Literal(384), t.Literal(576)]),
    heightDots: t.Integer({ minimum: 1, maximum: MAX_RASTER_HEIGHT_DOTS }),
    bits: t.Array(t.Boolean(), { maxItems: MAX_BITS }),
    cut: t.Optional(t.Boolean()),
    kickDrawer: t.Optional(t.Boolean()),
  }),
  printResult: t.Object({
    saleId: t.Integer(),
    sentBytes: t.Integer(),
    printedAt: t.Date(),
  }),
  drawerResult: t.Object({
    sentBytes: t.Integer(),
    kickedAt: t.Date(),
  }),
  testResult: t.Object({ ok: t.Literal(true) }),
}
