import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const kind = t.Union([t.Literal('fixed'), t.Literal('percent')])
const audience = t.Union([t.Literal('everyone'), t.Literal('members')])
const name = t.String({ minLength: 1, maxLength: 80 })
const day = t.String({ format: 'date' })
const minute = t.Integer({ minimum: 0, maximum: 1439 })
const weekdays = t.Array(t.Integer({ minimum: 0, maximum: 6 }), { maxItems: 7 })
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
    createdAt: t.Date(),
    updatedAt: t.Date(),
  }),
  create: t.Object({ name, kind, value: t.Integer({ minimum: 1 }), ...optionalRules }),
  update: t.Partial(t.Object({ name, kind, value: t.Integer({ minimum: 1 }), ...optionalRules })),
  listQuery: t.Object({
    isActive: t.Optional(t.BooleanString()),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
}
export type PromotionResponse = typeof promotionSchemas.promotion.static
