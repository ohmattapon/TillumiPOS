import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const name = t.String({ minLength: 1, maxLength: 120 })
const phone = t.String({ minLength: 1, maxLength: 80 })
const pagination = { limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })), offset: t.Optional(t.Numeric({ minimum: 0 })) }
const saleStatus = t.Union([t.Literal('completed'), t.Literal('voided')])
const pointMovementKind = t.Union([
  t.Literal('earn'), t.Literal('redeem'), t.Literal('void_earn'), t.Literal('void_redeem'), t.Literal('adjust'),
])
export const memberSchemas = {
  member: t.Object({
    id: t.Integer(), code: t.String(), name, phone, isActive: t.Boolean(),
    pointsBalance: t.Integer(), createdAt: t.Date(), updatedAt: t.Date(),
  }),
  create: t.Object({ name, phone }),
  update: t.Partial(t.Object({ name, phone, isActive: t.Boolean() })),
  listQuery: t.Object({ search: t.Optional(t.String({ maxLength: 120 })), isActive: t.Optional(t.BooleanString()), ...pagination }),
  historyQuery: t.Object({ from: t.Optional(t.String({ format: 'date' })), to: t.Optional(t.String({ format: 'date' })), status: t.Optional(saleStatus), ...pagination }),
  history: t.Object({
    items: t.Array(t.Object({ id: t.Integer(), receiptNo: t.String(), branchId: t.Integer(), cashierName: t.String(), status: saleStatus, totalSatang: satang(), createdAt: t.Date() })),
    total: t.Integer(), summary: t.Object({ saleCount: t.Integer(), totalSatang: t.Integer({ minimum: 0 }) }),
  }),
  adjustPoints: t.Object({
    points: t.Integer({ minimum: -1_000_000, maximum: 1_000_000 }),
    reason: t.String({ minLength: 1, maxLength: 200 }),
  }),
  pointsQuery: t.Object({ ...pagination }),
  pointMovement: t.Object({
    id: t.Integer(), kind: pointMovementKind, points: t.Integer(),
    saleId: t.Nullable(t.Integer()), quoteId: t.Nullable(t.Integer()), reason: t.Nullable(t.String()),
    actorId: t.Integer(), createdAt: t.Date(),
  }),
  adjustResult: t.Object({ memberId: t.Integer(), pointsBalance: t.Integer() }),
}
export type MemberResponse = typeof memberSchemas.member.static
