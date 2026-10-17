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
  ],
)

// A box or case of one product, sold under its own barcode. A barcode is unique across product and pack
// barcodes together; the repository checks the cross-table half under an advisory lock.
export const productPacks = pgTable(
  'product_packs',
  {
    id: id(),
    productId: integer()
      .notNull()
      .references(() => products.id),
    barcode: text().notNull().unique(),
    size: integer().notNull(),
    // Price of the whole pack, VAT included; null means size x the product price.
    priceSatang: integer(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index().on(table.productId),
    check('product_packs_size_range', sql`${table.size} between 2 and 9999`),
    check('product_packs_price_non_negative', sql`${table.priceSatang} >= 0`),
  ],
)
