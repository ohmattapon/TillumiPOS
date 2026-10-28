import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const kind = t.Union([t.Literal('fixed'), t.Literal('percent'), t.Literal('bundle')])
const audience = t.Union([t.Literal('everyone'), t.Literal('members')])
const name = t.String({ minLength: 1, maxLength: 80 })
/** Upper-case, 3–20 letters, digits or dashes; the entity normalizes and re-checks every entry. */
const couponCode = t.Union([t.String({ minLength: 3, maxLength: 100, pattern: '^[A-Za-z0-9-]+$' }), t.Null()])
const bundleQuantity = t.Union([t.Integer({ minimum: 1, maximum: 99 }), t.Null()])
const useLimit = t.Union([t.Integer({ minimum: 1 }), t.Null()])
const day = t.String({ format: 'date' })
const minute = t.Integer({ minimum: 0, maximum: 1439 })
const weekdays = t.Array(t.Integer({ minimum: 0, maximum: 6 }), { maxItems: 7 })
const ids = t.Array(t.Integer({ minimum: 1 }), { maxItems: 500 })
/** The products and categories a promotion is limited to; null is the whole bill. */
const scope = t.Nullable(t.Object({ productIds: ids, categoryIds: ids }))
const optionalRules = {
  maxDiscountSatang: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
  minSubtotalSatang: t.Optional(satang()),
  startsOn: t.Optional(t.Nullable(day)),
  endsOn: t.Optional(t.Nullable(day)),
  weekdays: t.Optional(t.Nullable(weekdays)),
  windowStartMinute: t.Optional(t.Nullable(minute)),
  windowEndMinute: t.Optional(t.Nullable(minute)),
  audience: t.Optional(audience),
  isActive: t.Optional(t.Boolean()),
  scope: t.Optional(scope),
  couponCode: t.Optional(couponCode),
  buyQuantity: t.Optional(bundleQuantity),
  freeQuantity: t.Optional(bundleQuantity),
  maxUses: t.Optional(useLimit),
  maxUsesPerMember: t.Optional(useLimit),
}

export const promotionSchemas = {
  promotion: t.Object({
    id: t.Integer(),
    name,
    kind,
    value: t.Integer(),
    maxDiscountSatang: t.Nullable(t.Integer()),
    minSubtotalSatang: t.Integer(),
    startsOn: t.Nullable(t.String()),
    endsOn: t.Nullable(t.String()),
    weekdays: t.Nullable(t.Array(t.Integer())),
    windowStartMinute: t.Nullable(t.Integer()),
    windowEndMinute: t.Nullable(t.Integer()),
    audience,
    isActive: t.Boolean(),
    scope,
    couponCode: t.Nullable(t.String()),
    buyQuantity: t.Nullable(t.Integer()),
    freeQuantity: t.Nullable(t.Integer()),
    maxUses: t.Nullable(t.Integer()),
    maxUsesPerMember: t.Nullable(t.Integer()),
    usedCount: t.Integer(),
    isExhausted: t.Boolean(),
    imageUrl: t.Nullable(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  }),
  image: t.Object({ file: t.File({ type: ['image/jpeg', 'image/png', 'image/webp'], maxSize: '2m' }) }),
  // The value bound is relaxed to 0 so a bundle can be typed; the entity keeps every other kind at 1+.
  create: t.Object({ name, kind, value: t.Integer({ minimum: 0 }), ...optionalRules }),
  update: t.Partial(t.Object({ name, kind, value: t.Integer({ minimum: 0 }), ...optionalRules })),
  listQuery: t.Object({
    isActive: t.Optional(t.BooleanString()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}
export type PromotionResponse = typeof promotionSchemas.promotion.static
