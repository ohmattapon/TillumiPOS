import { describe, expect, test } from 'bun:test'
import { MemberEntity } from './member.domain'

const props = { id: 12, name: '  สมชาย  ', phone: '+66 81 234 5678', isActive: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') }
describe('MemberEntity', () => {
  test('normalizes identity and derives stable immutable code', () => {
    const member = new MemberEntity(props)
    expect(member.toSnapshot()).toMatchObject({ id: 12, code: 'M000012', name: 'สมชาย', phone: '0812345678' })
    expect(member.with({ name: ' ใหม่ ' }, new Date('2026-02-01')).code).toBe(member.code)
    expect(member.name).toBe('สมชาย')
  })
  test('rejects invalid names', () => {
    for (const name of [' ', 'a'.repeat(121)]) expect(() => new MemberEntity({ ...props, name })).toThrow()
  })
  test('inactive members cannot be selected but retain their identity', () => {
    const member = new MemberEntity(props).with({ isActive: false }, props.updatedAt)
    expect(() => member.assertActive()).toThrow()
    expect(member.toSnapshot().code).toBe('M000012')
  })
})
