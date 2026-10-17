import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { assertValidPin } from './pin.vo'

describe('assertValidPin', () => {
  test.each(['1234', '123456', '0000'])('accepts %p', (pin) => {
    expect(() => assertValidPin(pin)).not.toThrow()
  })

  test.each(['123', '1234567', '12a4', ' 1234', '', '１２３４'])('rejects %p with INVALID_PIN', (pin) => {
    try {
      assertValidPin(pin)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('INVALID_PIN')
    }
  })
})
