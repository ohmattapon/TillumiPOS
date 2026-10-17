import { describe, expect, test } from 'bun:test'
import { appendDigit, canSubmitPin, removeDigit } from './pin-input'

describe('pin input', () => {
  test('appends digits up to 6 and ignores anything else', () => {
    expect(appendDigit('', '4')).toBe('4')
    expect(appendDigit('123456', '7')).toBe('123456')
    expect(appendDigit('12', 'a')).toBe('12')
    expect(appendDigit('12', '34')).toBe('12')
  })

  test('removes the last digit', () => {
    expect(removeDigit('123')).toBe('12')
    expect(removeDigit('')).toBe('')
  })

  test('can submit only 4 to 6 digits', () => {
    expect(canSubmitPin('123')).toBe(false)
    expect(canSubmitPin('1234')).toBe(true)
    expect(canSubmitPin('123456')).toBe(true)
    expect(canSubmitPin('1234567')).toBe(false)
  })
})
