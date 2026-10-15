import { boolean, index, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const members = pgTable('members', {
  id: id(),
  name: text().notNull(),
  phone: text().notNull().unique(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
}, (table) => [index('members_name_idx').on(table.name)])
