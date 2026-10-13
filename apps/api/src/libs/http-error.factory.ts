import { ZodError } from 'zod'
import { DomainConflictError } from '../domains/errors/domain-conflict.error'
import { DomainError } from '../domains/errors/domain-error'
import { DomainExternalServiceError } from '../domains/errors/domain-external-service.error'
import { DomainForbiddenError } from '../domains/errors/domain-forbidden.error'
import { DomainNotFoundError } from '../domains/errors/domain-not-found.error'
import { DomainUnauthorizedError } from '../domains/errors/domain-unauthorized.error'

/** Error body of every failed request: RFC 9457 Problem Details plus a stable machine-readable `code`. */
export interface ProblemDetails {
  /** Always "about:blank": the problem is fully identified by `status` and `code`. */
  type: 'about:blank'
  /** The standard phrase for `status`. */
  title: string
  status: number
  /** Message meant to be shown to the person using the app. */
  detail: string
  /** Stable identifier clients switch on, e.g. INSUFFICIENT_STOCK. */
  code: string
  /** Per-field issues, present on validation failures only. */
  errors?: unknown
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8'

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
}

export function problem(status: number, code: string, detail: string, errors?: unknown): ProblemDetails {
  return {
    type: 'about:blank',
    title: TITLES[status] ?? 'Error',
    status,
    detail,
    code,
    ...(errors !== undefined && { errors }),
  }
}

/** The HTTP response for a problem, with the media type RFC 9457 requires. */
export function problemResponse(details: ProblemDetails): Response {
  return new Response(JSON.stringify(details), {
    status: details.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  })
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
export function toProblem(error: unknown): ProblemDetails | null {
  if (error instanceof ZodError) return problem(422, 'VALIDATION', 'ข้อมูลไม่ถูกต้อง', error.issues)
  if (!(error instanceof DomainError)) return null

  const status = STATUS_BY_CLASS.find(([errorClass]) => error instanceof errorClass)?.[1] ?? 400
  return problem(status, error.code, error.message)
}
