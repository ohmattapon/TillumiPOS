import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { assertValidPin, isValidPin, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from './pin.vo'

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

describe('isValidPin', () => {
  test.each(['1234', '12345', '123456', '0000'])('accepts %p', (pin) => {
    expect(isValidPin(pin)).toBe(true)
  })

  test.each(['123', '1234567', '12a4', ' 1234', '1234 ', '', '１２３４', '١٢٣٤'])('rejects %p', (pin) => {
    expect(isValidPin(pin)).toBe(false)
  })

  test('the lengths the web pad counts to match the rule', () => {
    expect(isValidPin('1'.repeat(PIN_MIN_LENGTH))).toBe(true)
    expect(isValidPin('1'.repeat(PIN_MIN_LENGTH - 1))).toBe(false)
    expect(isValidPin('1'.repeat(PIN_MAX_LENGTH))).toBe(true)
    expect(isValidPin('1'.repeat(PIN_MAX_LENGTH + 1))).toBe(false)
  })
})
