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
}

export const settingsSchemas = {
  settings: t.Object(fields),
  update: t.Partial(t.Object(fields)),
}

export type SettingsResponse = typeof settingsSchemas.settings.static
