import { treaty } from '@elysiajs/eden'
import type { App } from '@pos/api'

// End-to-end typed client: routes, bodies and responses are inferred from the API source.
export const { api } = treaty<App>(window.location.origin)

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

/** Turns Eden's `{ data, error }` result into a value-or-throw promise, as TanStack Query expects. */
export async function unwrap<T>(request: Promise<EdenResult<T>>): Promise<T> {
  const { data, error } = await request
  if (error) {
    const body = error.value as { code?: string; message?: string } | null
    throw new ApiError(Number(error.status), body?.code ?? 'UNKNOWN', body?.message ?? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
  }
  return data as T
}
