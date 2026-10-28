import { describe, expect, test } from 'bun:test'
import { canSavePromptPay, isPromptPayTargetValid, normalizePromptPayTarget } from './promptpay'

describe('isPromptPayTargetValid', () => {
  test('a 10-digit number starting with 0 passes', () => {
    expect(isPromptPayTargetValid('0812345678')).toBe(true)
  })

  test('a 13-digit citizen id passes', () => {
    expect(isPromptPayTargetValid('1234567890123')).toBe(true)
  })

  test.each([
    ['letters', 'abc'],
    ['dashes', '081-234-5678'],
    ['spaces inside', '0812 345678'],
    ['9 digits', '081234567'],
    ['11 digits', '08123456789'],
    ['12 digits', '123456789012'],
    ['14 digits', '12345678901234'],
    ['10 digits not starting with 0', '1812345678'],
    ['empty', ''],
  ])('%s fails', (_label, value) => {
    expect(isPromptPayTargetValid(value)).toBe(false)
  })
})

describe('normalizePromptPayTarget', () => {
  test('blank becomes null', () => {
    expect(normalizePromptPayTarget('   ')).toBeNull()
  })

  test('trims surrounding whitespace', () => {
    expect(normalizePromptPayTarget('  0812345678  ')).toBe('0812345678')
  })
})

describe('canSavePromptPay', () => {
  test('switching to static with an empty target is saveable (warn at pay time)', () => {
    expect(canSavePromptPay('static', '')).toBe(true)
    expect(canSavePromptPay('static', '   ')).toBe(true)
  })

  test('a valid target is saveable in either mode', () => {
    expect(canSavePromptPay('static', '0812345678')).toBe(true)
    expect(canSavePromptPay('bank', '1234567890123')).toBe(true)
  })

  test('an invalid target blocks saving', () => {
    expect(canSavePromptPay('static', '081-234-5678')).toBe(false)
    expect(canSavePromptPay('bank', 'abc')).toBe(false)
  })
})
