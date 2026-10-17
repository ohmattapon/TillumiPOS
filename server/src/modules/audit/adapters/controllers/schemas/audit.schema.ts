import { t } from 'elysia'

export const auditSchemas = {
  query: t.Object({
    from: t.Optional(t.String({ format: 'date' })),
    to: t.Optional(t.String({ format: 'date' })),
    actorId: t.Optional(t.Numeric({ minimum: 1 })),
    action: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    entityType: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    entityId: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
    offset: t.Optional(t.Numeric({ minimum: 0 })),
  }),
  record: t.Object({
    id: t.Integer(), at: t.Date(), actorId: t.Nullable(t.Integer()), actorName: t.String(), branchId: t.Nullable(t.Integer()),
    action: t.String(), entityType: t.String(), entityId: t.String(), summary: t.String(),
    before: t.Unknown(), after: t.Unknown(), reason: t.Nullable(t.String()),
  }),
}
