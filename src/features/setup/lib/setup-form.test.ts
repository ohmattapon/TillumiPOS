import { expect, test } from 'bun:test'
import { isPromptPayAnswerValid, isSetupFormFilled, looksLikeThaiKeyboard, promptPayChangesFor } from './setup-form'

const filled = {
  setupCode: 'ABCDEFGHJKMN',
  shopName: 'ร้านกาแฟ',
  username: 'owner',
  displayName: 'เจ้าของ',
  password: 'correct-horse',
  confirm: 'correct-horse',
}

test('a form with every field filled and matching passwords is filled', () => {
  expect(isSetupFormFilled(filled)).toBe(true)
})

test.each([
  ['a blank field', { shopName: '   ' }],
  ['a password under 10 characters', { password: 'short', confirm: 'short' }],
  ['passwords that differ', { confirm: 'something-else' }],
])('%s is not filled', (_label, overrides) => {
  expect(isSetupFormFilled({ ...filled, ...overrides })).toBe(false)
})

test('the PromptPay number may be left blank, or be a mobile number or a 13-digit id', () => {
  expect(isPromptPayAnswerValid('')).toBe(true)
  expect(isPromptPayAnswerValid('  ')).toBe(true)
  expect(isPromptPayAnswerValid('0812345678')).toBe(true)
  expect(isPromptPayAnswerValid(' 1234567890123 ')).toBe(true)
})

test('a PromptPay number that is not a mobile number or a 13-digit id is refused', () => {
  expect(isPromptPayAnswerValid('812345678')).toBe(false)
  expect(isPromptPayAnswerValid('081-234-5678')).toBe(false)
  expect(isPromptPayAnswerValid('123456789012')).toBe(false)
})

test('a given PromptPay number is saved as a static QR, and a blank one saves nothing', () => {
  expect(promptPayChangesFor(' 0812345678 ')).toEqual({ promptpayMode: 'static', promptpayTarget: '0812345678' })
  expect(promptPayChangesFor('   ')).toBeNull()
})

test('Thai characters in the setup code mean the keyboard is on the Thai layout', () => {
  expect(looksLikeThaiKeyboard('อรรรถ')).toBe(true)
  expect(looksLikeThaiKeyboard('ZXKF อ')).toBe(true)
  expect(looksLikeThaiKeyboard('ZXKFWVME5R64')).toBe(false)
  expect(looksLikeThaiKeyboard('')).toBe(false)
})
