import { boolean, check, integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const vatMode = pgEnum('vat_mode', ['inclusive', 'exclusive', 'none'])
export const shopHomeView = pgEnum('shop_home_view', ['till', 'tables'])

// A shop has exactly one row of settings; the check keeps it that way.
export const shopSettings = pgTable(
  'shop_settings',
  {
    id: integer().primaryKey().default(1),
    shopName: text().notNull(),
    taxId: text(),
    address: text(),
    phone: text(),
    currency: text().notNull(),
    vatMode: vatMode().notNull(),
    vatRateBp: integer().notNull(),
    timeZone: text().notNull(),
    locale: text().notNull(),
    // Width of the thermal paper receipts are laid out for: 58 or 80.
    receiptPaperMm: integer().notNull().default(80),
    receiptFooter: text(),
    // What the sell screen opens on: the till itself, or the floor plan of tables.
    homeView: shopHomeView().notNull().default('till'),
    // Which screens the web shows. True by default so a shop set up before these existed keeps them all.
    tablesEnabled: boolean().notNull().default(true),
    kitchenEnabled: boolean().notNull().default(true),
    modifiersEnabled: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('shop_settings_single_row', sql`${table.id} = 1`)],
)
