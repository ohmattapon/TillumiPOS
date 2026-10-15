import { describe, expect, test } from 'bun:test'
import { resolveCheckoutMode } from './checkout-mode'

describe('resolveCheckoutMode', () => {
  test('defaults to legacy to preserve existing installations', () => {
    expect(resolveCheckoutMode(undefined)).toBe('legacy')
    expect(resolveCheckoutMode('')).toBe('legacy')
  })

  test('accepts the explicit shifts cutover mode', () => {
    expect(resolveCheckoutMode('shifts')).toBe('shifts')
  })

  test('rejects unknown values at startup', () => {
    expect(() => resolveCheckoutMode('anything-else')).toThrow('CHECKOUT_MODE')
  })
})
