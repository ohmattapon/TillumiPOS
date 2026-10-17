import { boolean, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { products } from './products'

export const branches = pgTable('branches', {
  id: id(),
  // Upper case; prefixes the receipt numbers of the branch.
  code: text().notNull().unique(),
  name: text().notNull(),
  address: text(),
  phone: text(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})

// What a branch has on its shelves. The stock_movements ledger is the source of truth;
// a product with no row here has none in that branch.
export const branchStock = pgTable(
  'branch_stock',
  {
    branchId: integer()
      .notNull()
      .references(() => branches.id),
    productId: integer()
      .notNull()
      .references(() => products.id),
    qty: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.productId] })],
)
