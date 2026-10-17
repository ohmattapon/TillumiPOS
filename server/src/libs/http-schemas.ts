import { t, type TSchema } from 'elysia'

export const idParams = t.Object({ id: t.Numeric({ minimum: 1 }) })
export const idempotencyHeaders = t.Object({ 'idempotency-key': t.String({ format: 'uuid' }) })

/** Money is always an integer number of satang (1 baht = 100 satang). */
export const satang = (options?: { minimum?: number }) => t.Integer({ minimum: options?.minimum ?? 0 })

/** Every list endpoint answers with this shape, paginated or not, so adding pagination later is not a breaking change. */
export const page = <T extends TSchema>(item: T) => t.Object({ items: t.Array(item), total: t.Integer() })

/** RFC 9457 problem details: the body of every error response. */
export const problemDetails = t.Object({
  type: t.Literal('about:blank'),
  title: t.String(),
  status: t.Integer(),
  detail: t.String(),
  code: t.String(),
  errors: t.Optional(t.Unknown()),
})
