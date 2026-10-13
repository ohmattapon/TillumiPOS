import { treaty } from '@elysiajs/eden'
import type { App } from '@pos/api'
import i18n from 'i18next'
import { chosenBranchId } from './active-branch'

// End-to-end typed client: routes, bodies and responses are inferred from the API source.
// Every request names the branch being worked in; without a choice the API uses the user's own.
export const api = treaty<App>(window.location.origin, {
  headers: () => {
    const branchId = chosenBranchId()
    return branchId === null ? {} : { 'x-branch-id': String(branchId) }
  },
}).api.v1

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface EdenResult<T> {
  data: T | null
  error: { status: unknown; value: unknown } | null
}

/** RFC 9457 problem details as the API sends them. */
interface Problem {
  code?: string
  detail?: string
  params?: Record<string, string | number>
}

/** The language the API writes its `detail` messages in. */
const SERVER_LANGUAGE = 'th'

/**
 * The message to show for a failed request. The API's own wording is used while the interface is in
 * the API's language; in other languages the message is rebuilt from the stable `code` and its `params`,
 * and the server's wording stays as the fallback for codes that have no translation.
 */
function messageFor(problem: Problem | null): string {
  const fallback = problem?.detail ?? i18n.t('connectionFailed')
  if (!problem?.code || i18n.language === SERVER_LANGUAGE) return fallback

  const key = `errors:${problem.code}`
  // The key is only known at run time, so it cannot be one of the typed keys.
  return i18n.exists(key) ? i18n.t(key as never, { ...problem.params, defaultValue: fallback }) : fallback
}

/** Turns Eden's `{ data, error }` result into a value-or-throw promise, as TanStack Query expects. */
export async function unwrap<T>(request: Promise<EdenResult<T>>): Promise<T> {
  const { data, error } = await request
  if (error) {
    const problem = error.value as Problem | null
    throw new ApiError(Number(error.status), problem?.code ?? 'UNKNOWN', messageFor(problem))
  }
  return data as T
}
