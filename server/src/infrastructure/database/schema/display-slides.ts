import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

// Marketing slides for the customer display, shared by every branch like promotions.
export const displaySlides = pgTable(
  'display_slides',
  {
    id: id(),
    imageKey: text().notNull().unique(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [index('display_slides_is_active_idx').on(table.isActive)],
)
