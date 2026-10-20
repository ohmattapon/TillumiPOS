import { t } from 'elysia'

const vatMode = t.Union([t.Literal('inclusive'), t.Literal('exclusive'), t.Literal('none')])
const locale = t.Union([t.Literal('th'), t.Literal('en')])

const fields = {
  shopName: t.String({ minLength: 1, maxLength: 100 }),
  taxId: t.Nullable(t.String({ maxLength: 20 })),
  address: t.Nullable(t.String({ maxLength: 300 })),
  phone: t.Nullable(t.String({ maxLength: 30 })),
  currency: t.String({ minLength: 3, maxLength: 3 }),
  vatMode,
  vatRateBp: t.Integer({ minimum: 0, maximum: 10_000 }),
  timeZone: t.String({ minLength: 1, maxLength: 64 }),
  locale,
  receiptPaperMm: t.Union([t.Literal(58), t.Literal(80)]),
  receiptFooter: t.Nullable(t.String({ maxLength: 200 })),
  homeView: t.Union([t.Literal('till'), t.Literal('tables')]),
  tablesEnabled: t.Boolean(),
  modifiersEnabled: t.Boolean(),
  promptpayMode: t.Union([t.Literal('bank'), t.Literal('static')]),
  promptpayTarget: t.Nullable(t.String({ maxLength: 13 })),
  receiptPrinterIp: t.Nullable(t.String({ maxLength: 45 })),
  receiptPrinterPort: t.Integer({ minimum: 1, maximum: 65535 }),
  receiptPrinterEnabled: t.Boolean(),
  cashDrawerEnabled: t.Boolean(),
}

export const settingsSchemas = {
  // The storage key stays internal; the response carries a ready-to-use URL instead.
  settings: t.Object({ ...fields, logoUrl: t.Nullable(t.String()) }),
  update: t.Partial(t.Object(fields)),
  logo: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '2m' }) }),
}

export type SettingsResponse = typeof settingsSchemas.settings.static
