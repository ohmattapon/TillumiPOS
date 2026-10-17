import { describe, expect, test } from 'bun:test'
import { BranchEntity, type BranchEntityProps } from './branch.domain'
import { DomainError } from './errors/domain-error'

const props = (overrides: Partial<BranchEntityProps> = {}): BranchEntityProps => ({
  id: 1,
  code: 'MAIN',
  name: 'สาขาหลัก',
  address: null,
  phone: null,
  isActive: true,
  ...overrides,
})

describe('BranchEntity', () => {
  test('accepts a valid branch', () => {
    expect(new BranchEntity(props()).toSnapshot()).toEqual(props())
  })

  test.each(['', 'A', 'main', 'AB CD', 'ABCDEFGHIJK', 'สาขา'])('rejects the code %p', (code) => {
    expect(() => new BranchEntity(props({ code }))).toThrow(DomainError)
  })

  test('rejects an empty or overlong name', () => {
    expect(() => new BranchEntity(props({ name: '' }))).toThrow(DomainError)
    expect(() => new BranchEntity(props({ name: 'ก'.repeat(101) }))).toThrow(DomainError)
  })

  test('rejects an overlong address and phone', () => {
    expect(() => new BranchEntity(props({ address: 'ก'.repeat(501) }))).toThrow(DomainError)
    expect(() => new BranchEntity(props({ phone: '0'.repeat(31) }))).toThrow(DomainError)
  })

  test('normalizes a code to upper case', () => {
    expect(BranchEntity.normalizeCode(' bkk01 ')).toBe('BKK01')
  })

  test('with() changes only what is given and never the code', () => {
    const changed = new BranchEntity(props({ address: 'เดิม' })).with({ name: 'สาขาใหม่', isActive: false })

    expect(changed).toMatchObject({ code: 'MAIN', name: 'สาขาใหม่', address: 'เดิม', isActive: false })
  })

  test('with() clears the address and phone with null but keeps them for undefined', () => {
    const branch = new BranchEntity(props({ address: 'ที่อยู่', phone: '02' }))

    expect(branch.with({ address: null })).toMatchObject({ address: null, phone: '02' })
    expect(branch.with({})).toMatchObject({ address: 'ที่อยู่', phone: '02' })
  })
})
