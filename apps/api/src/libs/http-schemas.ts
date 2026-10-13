import { t } from 'elysia'

export const idParams = t.Object({ id: t.Numeric({ minimum: 1 }) })

/** Money is always an integer number of satang (1 baht = 100 satang). */
export const satang = (options?: { minimum?: number }) => t.Integer({ minimum: options?.minimum ?? 0 })

export const errorResponse = t.Object({ code: t.String(), message: t.String() })
