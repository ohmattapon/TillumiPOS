const DEFINITIVE_REJECTIONS = ['STOCK_RECEIPT_INVALID_ITEMS', 'VALIDATION', 'IDEMPOTENCY_KEY_REQUIRED']

interface ErrorShape { status?: unknown; code?: unknown; params?: Record<string, unknown> }

const shapeOf = (error: unknown): ErrorShape => (typeof error === 'object' && error !== null ? error : {})

/**
 * Only a definitive application rejection is safe to edit after. Auth and transport outcomes might
 * arrive after an earlier attempt succeeded, so those keep their exact request. Read by shape so this
 * file stays free of the API client.
 */
export function isDefinitiveRejection(error: unknown): boolean {
  const { status, code } = shapeOf(error)
  return typeof status === 'number' && status >= 400 && status < 500 && typeof code === 'string' && DEFINITIVE_REJECTIONS.includes(code)
}

/** The products the API named as invalid, or null when the error is about something else. */
export function invalidProductIds(error: unknown): number[] | null {
  const { code, params } = shapeOf(error)
  if (code !== 'STOCK_RECEIPT_INVALID_ITEMS') return null
  return String(params?.productIds ?? '').split(',').map(Number)
}
