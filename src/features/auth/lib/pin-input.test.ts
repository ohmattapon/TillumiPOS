import { describe, expect, test } from 'bun:test'
import { appendDigit, canSubmitPin, pinKeyAction, removeDigit } from './pin-input'

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

describe('pinKeyAction', () => {
  const base = { targetIsInsidePad: false, targetIsButtonOrLink: false, targetIsSubmit: false, pin: '1234' }

  test('a digit key adds a digit', () => {
    expect(pinKeyAction({ ...base, key: '7' })).toBe('digit')
  })

  test('Backspace removes a digit', () => {
    expect(pinKeyAction({ ...base, key: 'Backspace' })).toBe('backspace')
  })

  test('Enter submits from anywhere that is not another button', () => {
    expect(pinKeyAction({ ...base, key: 'Enter' })).toBe('submit')
  })

  test('Enter on a pad digit button submits, after the keypad was tapped', () => {
    expect(pinKeyAction({ ...base, key: 'Enter', targetIsInsidePad: true, targetIsButtonOrLink: true })).toBe('submit')
  })

  test('Enter on a pad digit with too few digits is swallowed, so the button does not add its digit again', () => {
    expect(pinKeyAction({ ...base, key: 'Enter', pin: '12', targetIsInsidePad: true, targetIsButtonOrLink: true })).toBe('swallow')
  })

  test("Enter on the pad's own submit is left to its native click", () => {
    expect(pinKeyAction({ ...base, key: 'Enter', targetIsInsidePad: true, targetIsButtonOrLink: true, targetIsSubmit: true })).toBe('ignore')
  })

  test('Enter on a button outside the pad (Cancel, use password) is ignored', () => {
    expect(pinKeyAction({ ...base, key: 'Enter', targetIsButtonOrLink: true })).toBe('ignore')
  })

  test('other keys are ignored', () => {
    expect(pinKeyAction({ ...base, key: 'a' })).toBe('ignore')
  })
})
