import { expect, test } from 'bun:test'
import { isSetupFormFilled } from './setup-form'

const filled = {
  setupCode: 'ABCDEFGHJKMN',
  shopName: 'ร้านกาแฟ',
  branchName: 'สาขาหลัก',
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
