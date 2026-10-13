import { describe, expect, test } from 'bun:test'
import { RegisterEntity } from './register.domain'

const register = (overrides: Partial<ConstructorParameters<typeof RegisterEntity>[0]> = {}) =>
  new RegisterEntity({
    id: 1,
    branchId: 1,
    code: 'MAIN',
    name: 'เคาน์เตอร์หลัก',
    isActive: true,
    ...overrides,
  })

describe('RegisterEntity', () => {
  test('accepts a stable code and a display name', () => {
    expect(register()).toMatchObject({ id: 1, branchId: 1, code: 'MAIN', isActive: true })
  })

  test('allows id zero before persistence assigns an id', () => {
    expect(register({ id: 0 }).id).toBe(0)
  })

  test.each(['lowercase', 'has space', 'a'.repeat(21), ''])('rejects invalid register code %s', (code) => {
    expect(() => register({ code })).toThrow('รหัสจุดขาย')
  })

  test('rejects an empty or oversized display name', () => {
    expect(() => register({ name: '' })).toThrow('ชื่อจุดขาย')
    expect(() => register({ name: 'ก'.repeat(101) })).toThrow('ชื่อจุดขาย')
  })

  test('renames without changing branch or code', () => {
    const renamed = register().rename('เคาน์เตอร์หน้า')

    expect(renamed.toSnapshot()).toMatchObject({ branchId: 1, code: 'MAIN', name: 'เคาน์เตอร์หน้า' })
  })

  test('deactivates as an immutable copy', () => {
    const inactive = register().deactivate()

    expect(inactive.isActive).toBe(false)
    expect(register().isActive).toBe(true)
  })
})
