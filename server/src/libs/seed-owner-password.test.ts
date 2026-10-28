import { describe, expect, test } from 'bun:test'
import { requireSeedOwnerPassword } from './seed-owner-password'

describe('seed owner password configuration', () => {
  test.each([undefined, '', '   ', 'choose-a-password-here', 'change-me', 'your-owner-password', ' ADMIN1234 '])(
    'rejects missing or published example/default passwords without revealing them',
    (value) => {
      expect(() => requireSeedOwnerPassword(value)).toThrow('Set SEED_OWNER_PASSWORD to a new password before seeding')
    },
  )

  test('preserves an explicitly chosen password exactly, including spaces', () => {
    expect(requireSeedOwnerPassword(' fixture-owner-passphrase ')).toBe(' fixture-owner-passphrase ')
  })
})
