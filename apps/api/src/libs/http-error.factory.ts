import { ZodError } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'

export interface HttpErrorResponse {
  status: number
  body: { code: string; message: string; errors?: unknown }
}

// Most specific first; plain DomainError is the 400 fallback below.
const STATUS_BY_CLASS: [new (...args: never[]) => DomainError, number][] = [
  [DomainUnauthorizedError, 401],
  [DomainForbiddenError, 403],
  [DomainNotFoundError, 404],
  [DomainConflictError, 409],
  [DomainExternalServiceError, 502],
]

/**
 * The single place where domain failures become HTTP. Returns null for anything that is
 * not a deliberate business failure, so the caller answers with a generic 500.
 */
export function toErrorResponse(error: unknown): HttpErrorResponse | null {
  if (error instanceof ZodError)
    return { status: 422, body: { code: 'VALIDATION', message: 'ข้อมูลไม่ถูกต้อง', errors: error.issues } }
  if (!(error instanceof DomainError)) return null

  const status = STATUS_BY_CLASS.find(([errorClass]) => error instanceof errorClass)?.[1] ?? 400
  return { status, body: { code: error.code, message: error.message } }
}
