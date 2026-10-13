import { boolean, check, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps } from '../../../db/columns'
import { categories } from '../categories/schema'

export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text().notNull().unique(),
    barcode: text().unique(),
    name: text().notNull(),
    // Object key in the media bucket; the public URL is derived from it.
    imageKey: text(),
    categoryId: integer().references(() => categories.id, { onDelete: 'set null' }),
    // Selling price, VAT included.
    priceSatang: integer().notNull(),
    costSatang: integer().notNull().default(0),
    trackStock: boolean().notNull().default(true),
    // Cached balance; the stock_movements ledger is the source of truth.
    stockQty: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index().on(table.categoryId),
    index().on(table.name),
    check('products_price_non_negative', sql`${table.priceSatang} >= 0 and ${table.costSatang} >= 0`),
  ],
)
