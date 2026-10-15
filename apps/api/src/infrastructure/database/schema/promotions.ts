import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const promotionKind = pgEnum('promotion_kind', ['fixed', 'percent'])
export const promotionAudience = pgEnum('promotion_audience', ['everyone', 'members'])

// Shared by every branch and never deleted: a sale keeps its own snapshot, so a promotion that is over
// is just switched off. `value` is satang for `fixed` and basis points for `percent`.
export const promotions = pgTable(
  'promotions',
  {
    id: id(),
    name: text().notNull(),
    kind: promotionKind().notNull(),
    value: integer().notNull(),
    maxDiscountSatang: integer(),
    minSubtotalSatang: integer().notNull().default(0),
    // Dates in the shop's time zone, both included; null means unbounded.
    startsOn: date({ mode: 'string' }),
    endsOn: date({ mode: 'string' }),
    // 0 = Sunday ... 6 = Saturday; null means every day.
    weekdays: integer().array(),
    windowStartMinute: integer(),
    windowEndMinute: integer(),
    audience: promotionAudience().notNull().default('everyone'),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('promotions_name_lower_unique').on(sql`lower(${table.name})`),
    index('promotions_is_active_idx').on(table.isActive),
    check('promotions_value_positive', sql`${table.value} > 0`),
  ],
)
