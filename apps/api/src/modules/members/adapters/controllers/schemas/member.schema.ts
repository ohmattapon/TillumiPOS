import { t } from 'elysia'
import { satang } from '../../../../../libs/http-schemas'

const name = t.String({ minLength: 1, maxLength: 120 })
const phone = t.String({ minLength: 1, maxLength: 80 })
const pagination = { limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })), offset: t.Optional(t.Numeric({ minimum: 0 })) }
const saleStatus = t.Union([t.Literal('completed'), t.Literal('voided')])
export const memberSchemas = {
  member: t.Object({ id: t.Integer(), code: t.String(), name, phone, isActive: t.Boolean(), createdAt: t.Date(), updatedAt: t.Date() }),
  create: t.Object({ name, phone }),
  update: t.Partial(t.Object({ name, phone, isActive: t.Boolean() })),
  listQuery: t.Object({ search: t.Optional(t.String({ maxLength: 120 })), isActive: t.Optional(t.BooleanString()), ...pagination }),
  historyQuery: t.Object({ from: t.Optional(t.String({ format: 'date' })), to: t.Optional(t.String({ format: 'date' })), status: t.Optional(saleStatus), ...pagination }),
  history: t.Object({
    items: t.Array(t.Object({ id: t.Integer(), receiptNo: t.String(), branchId: t.Integer(), cashierName: t.String(), status: saleStatus, totalSatang: satang(), createdAt: t.Date() })),
    total: t.Integer(), summary: t.Object({ saleCount: t.Integer(), totalSatang: t.Integer({ minimum: 0 }) }),
  }),
}
export type MemberResponse = typeof memberSchemas.member.static
