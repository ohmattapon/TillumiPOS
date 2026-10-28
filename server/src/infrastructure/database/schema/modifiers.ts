import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'
import { products } from './products'

/** An option chosen on an order or sale line, as it was when chosen (see LineOption in the domain). */
export interface StoredLineOption {
  groupId: number
  groupName: string
  optionId: number
  name: string
  priceSatang: number
  costSatang: number
}

// Groups of options such as "sweetness" or "toppings", shared by every product they are offered on.
export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: id(),
    name: text().notNull().unique(),
    required: boolean().notNull().default(false),
    maxSelections: integer().notNull().default(1),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [check('modifier_groups_max_selections', sql`${table.maxSelections} between 1 and 20`)],
)

export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: id(),
    groupId: integer()
      .notNull()
      .references(() => modifierGroups.id),
    name: text().notNull(),
    priceSatang: integer().notNull().default(0),
    costSatang: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index().on(table.groupId),
    unique().on(table.groupId, table.name),
    check('modifier_options_non_negative', sql`${table.priceSatang} >= 0 and ${table.costSatang} >= 0`),
  ],
)

// Which groups a product offers, in the order they are asked.
export const productModifierGroups = pgTable(
  'product_modifier_groups',
  {
    productId: integer()
      .notNull()
      .references(() => products.id),
    groupId: integer()
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.productId, table.groupId] }), index().on(table.groupId)],
)
