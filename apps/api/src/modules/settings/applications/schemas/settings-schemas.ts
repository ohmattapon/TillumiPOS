import { z } from 'zod'
import { VAT_MODES } from '../../../../domains/pricing'
import { HOME_VIEWS, LOCALES, RECEIPT_PAPER_WIDTHS } from '../../../../domains/shop-settings.domain'

// An empty field means "not set", so an owner clears an optional detail by blanking it.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value))

export const updateShopSettingsSchema = z
  .object({
    shopName: z.string().trim().min(1).max(100),
    taxId: optionalText(20),
    address: optionalText(300),
    phone: optionalText(30),
    currency: z.string().trim().toUpperCase().length(3),
    vatMode: z.enum(VAT_MODES),
    vatRateBp: z.number().int().min(0).max(10_000),
    timeZone: z.string().trim().min(1).max(64),
    locale: z.enum(LOCALES),
    receiptPaperMm: z.union(RECEIPT_PAPER_WIDTHS.map((width) => z.literal(width))),
    receiptFooter: optionalText(200),
    homeView: z.enum(HOME_VIEWS),
  })
  .partial()
