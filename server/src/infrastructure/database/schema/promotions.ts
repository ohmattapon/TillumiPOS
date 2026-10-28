import { sql } from 'drizzle-orm'
import { boolean, check, date, index, integer, pgEnum, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, timestamps } from '../columns'

export const promotionKind = pgEnum('promotion_kind', ['fixed', 'percent', 'bundle'])
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
    startsOn: date(),
    endsOn: date(),
    // 0 = Sunday ... 6 = Saturday; null means every day.
    weekdays: integer().array(),
    windowStartMinute: integer(),
    windowEndMinute: integer(),
    audience: promotionAudience().notNull().default('everyone'),
    isActive: boolean().notNull().default(true),
    // Upper-case coupon code; a promotion with one applies only when the cashier types it. One code per bill.
    couponCode: text(),
    // Of a `bundle`: the items the customer buys and the free ones per complete group, both 1–99; null for the
    // other kinds. `value` stays 0, so the total rules never see a made-up amount.
    buyQuantity: integer(),
    freeQuantity: integer(),
    // Times this promotion may be used in total, or by one member; null means unlimited. Only usable sales and
    // quotes reserved by a QR count.
    maxUses: integer(),
    maxUsesPerMember: integer(),
    // The products and categories it is limited to; both null (or empty) means the whole bill. No foreign key:
    // a product or category that is switched off later simply matches no line.
    productIds: integer().array(),
    categoryIds: integer().array(),
    // Storage key of the display image; null means no image. Only the image endpoints write it.
    imageKey: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('promotions_name_lower_unique').on(sql`lower(${table.name})`),
    // A coupon code is one shared namespace between kinds, matched ignoring case.
    uniqueIndex('promotions_coupon_code_upper_unique').on(sql`upper(${table.couponCode})`),
    index('promotions_is_active_idx').on(table.isActive),
    check(
      'promotions_value_positive',
      sql`${table.kind} = 'bundle' OR ${table.value} > 0`,
    ),
    check(
      'promotions_bundle_quantities',
      sql`${table.kind} <> 'bundle' OR (${table.buyQuantity} BETWEEN 1 AND 99 AND ${table.freeQuantity} BETWEEN 1 AND 99)`,
    ),
  ],
)
