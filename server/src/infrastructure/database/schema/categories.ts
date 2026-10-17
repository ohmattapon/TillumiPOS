import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const categories = pgTable('categories', {
  id: id(),
  name: text().notNull().unique(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})
