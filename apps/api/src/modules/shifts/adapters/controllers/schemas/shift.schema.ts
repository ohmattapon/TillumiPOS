import { t } from 'elysia'

const nullableDate = t.Nullable(t.Date())
const nullableInteger = t.Nullable(t.Integer())
const nullableString = t.Nullable(t.String())

export const shiftHttpSchemas = {
  register: t.Object({
    id: t.Integer(), branchId: t.Integer(), code: t.String(), name: t.String(), isActive: t.Boolean(),
  }),
  createRegister: t.Object({ code: t.String({ minLength: 1, maxLength: 20, pattern: '^[A-Z0-9-]+$' }), name: t.String({ minLength: 1, maxLength: 100 }) }),
  updateRegister: t.Object({ name: t.Optional(t.String({ minLength: 1, maxLength: 100 })), isActive: t.Optional(t.Boolean()) }),
  shift: t.Object({
    id: t.Integer(), branchId: t.Integer(), registerId: t.Integer(), status: t.Union([t.Literal('open'), t.Literal('closing'), t.Literal('closed')]),
    openedAt: t.Date(), openedById: t.Integer(), openedByName: t.String(), openingCashSatang: t.Integer(), openingNote: nullableString,
    currency: t.String(), timeZone: t.String(), closingRevision: t.Integer(), closingStartedAt: nullableDate,
    closingStartedById: nullableInteger, closingStartedByName: nullableString, closingExpectedCashSatang: nullableInteger,
    closedAt: nullableDate, closedById: nullableInteger, closedByName: nullableString, countedCashSatang: nullableInteger,
    cashDifferenceSatang: nullableInteger, differenceReason: nullableString,
  }),
  openShift: t.Object({ registerId: t.Integer({ minimum: 1 }), openingCashSatang: t.Integer({ minimum: 0, maximum: 2_147_483_647 }), openingNote: t.Optional(t.Nullable(t.String({ maxLength: 500 }))) }),
  closeShift: t.Object({ closingRevision: t.Integer({ minimum: 1 }), countedCashSatang: t.Integer({ minimum: 0, maximum: 2_147_483_647 }), reason: t.Optional(t.String({ maxLength: 500 })) }),
  startClosing: t.Optional(t.Object({ acknowledgePendingQr: t.Optional(t.Boolean()) })),
  shiftRevision: t.Object({ closingRevision: t.Integer({ minimum: 1 }) }),
  cashEntry: t.Object({
    id: t.Integer(), shiftId: t.Integer(), kind: t.Union([t.Literal('cash_sale'), t.Literal('cash_in'), t.Literal('cash_out'), t.Literal('cash_refund')]),
    amountSatang: t.Integer(), saleId: nullableInteger, actorId: t.Integer(), actorName: t.String(), reason: nullableString, createdAt: t.Date(),
  }),
  cashMovement: t.Object({ kind: t.Union([t.Literal('cash_in'), t.Literal('cash_out')]), amountSatang: t.Integer({ minimum: 1, maximum: 2_147_483_647 }), reason: t.String({ minLength: 1, maxLength: 500 }) }),
  currentShift: t.Nullable(t.Object({
    id: t.Integer(), registerId: t.Integer(), status: t.Union([t.Literal('open'), t.Literal('closing')]),
    openedAt: t.Date(), openedByName: t.String(), openingCashSatang: t.Integer(), closingRevision: t.Integer(),
  })),
  registerIdParams: t.Object({ id: t.Numeric({ minimum: 1 }) }),
  shiftListQuery: t.Object({
    registerId: t.Optional(t.Numeric({ minimum: 1 })), status: t.Optional(t.Union([t.Literal('open'), t.Literal('closing'), t.Literal('closed')])),
    from: t.Optional(t.Date()), to: t.Optional(t.Date()), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 1000, default: 50 })),
    offset: t.Optional(t.Numeric({ minimum: 0, default: 0 })),
  }),
  pageQuery: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 1000, default: 100 })), offset: t.Optional(t.Numeric({ minimum: 0, default: 0 })) }),
}
