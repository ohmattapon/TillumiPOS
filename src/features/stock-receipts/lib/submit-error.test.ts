import { describe, expect, test } from 'bun:test'
import { invalidProductIds, isDefinitiveRejection } from './submit-error'

const apiError = (status: number, code: string, params?: Record<string, unknown>) => Object.assign(new Error(code), { status, code, params })

describe('isDefinitiveRejection', () => {
  test('a 4xx answer with a rejection code can be edited after', () => {
    expect(isDefinitiveRejection(apiError(400, 'STOCK_RECEIPT_INVALID_ITEMS'))).toBe(true)
    expect(isDefinitiveRejection(apiError(400, 'VALIDATION'))).toBe(true)
    expect(isDefinitiveRejection(apiError(400, 'IDEMPOTENCY_KEY_REQUIRED'))).toBe(true)
  })

  test('auth, server and transport failures keep the exact request', () => {
    expect(isDefinitiveRejection(apiError(401, 'UNAUTHORIZED'))).toBe(false)
    expect(isDefinitiveRejection(apiError(500, 'VALIDATION'))).toBe(false)
    expect(isDefinitiveRejection(apiError(400, 'SOMETHING_ELSE'))).toBe(false)
    expect(isDefinitiveRejection(new Error('network'))).toBe(false)
    expect(isDefinitiveRejection(undefined)).toBe(false)
  })
})

describe('invalidProductIds', () => {
  test('reads the product ids the API named', () => {
    expect(invalidProductIds(apiError(400, 'STOCK_RECEIPT_INVALID_ITEMS', { productIds: '4,9' }))).toEqual([4, 9])
  })

  test('is null for any other error', () => {
    expect(invalidProductIds(apiError(400, 'VALIDATION'))).toBeNull()
    expect(invalidProductIds(new Error('x'))).toBeNull()
  })
})
