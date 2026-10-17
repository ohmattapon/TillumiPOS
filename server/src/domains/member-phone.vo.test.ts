import { describe, expect, test } from 'bun:test'
import { MemberPhone } from './member-phone.vo'

describe('MemberPhone', () => {
  test('normalizes local and international Thai mobile identities', () => {
    for (const value of ['081-234-5678', '(081) 234 5678', '+66 81 234 5678', '66812345678'])
      expect(new MemberPhone(value).value).toBe('0812345678')
    expect(new MemberPhone('+1 (202) 555-0123').value).toBe('+12025550123')
  })
  test('rejects invalid characters, misplaced plus and invalid lengths', () => {
    for (const value of ['', '1234567', '1234567890123456', '08abc123456', '08+12345678', '++66812345678'])
      expect(() => new MemberPhone(value)).toThrow()
  })
})
