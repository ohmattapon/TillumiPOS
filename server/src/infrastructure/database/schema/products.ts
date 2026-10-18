import { boolean, check, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { id, timestamps } from '../columns'
import { categories } from './categories'

export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text().notNull().unique(),
    barcode: text().unique(),
    name: text().notNull(),
    productType: text().$type<'normal' | 'cafe'>().notNull().default('normal'),
    // Object key in the media bucket; the public URL is derived from it.
    imageKey: text(),
    categoryId: integer().references(() => categories.id, { onDelete: 'set null' }),
    // Selling price, VAT included.
    priceSatang: integer().notNull(),
    costSatang: integer().notNull().default(0),
    trackStock: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index().on(table.categoryId),
    index().on(table.name),
    check('products_price_non_negative', sql`${table.priceSatang} >= 0 and ${table.costSatang} >= 0`),
    check('products_product_type_allowed', sql`${table.productType} in ('normal', 'cafe')`),
  ],
)
