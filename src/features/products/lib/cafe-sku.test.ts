import { describe, expect, test } from 'bun:test'
import { nextCafeSku } from './cafe-sku'

describe('nextCafeSku', () => {
  test('starts at CAFE-001 when the shop has no cafe code yet', () => {
    expect(nextCafeSku([])).toBe('CAFE-001')
  })

  test('moves past the numbers already in use', () => {
    expect(nextCafeSku(['CAFE-001', 'CAFE-002'])).toBe('CAFE-003')
  })

  test('fills the first gap rather than counting the list', () => {
    expect(nextCafeSku(['CAFE-001', 'CAFE-003'])).toBe('CAFE-002')
  })

  test('treats a code in another case as taken', () => {
    expect(nextCafeSku(['cafe-001', 'Cafe-002'])).toBe('CAFE-003')
  })

  test('ignores SKUs that are not a numeric cafe code', () => {
    expect(nextCafeSku(['CAFE-ESP-HOT', 'E2E-CAFE', 'CAFE-', 'CAFE-00X', 'น้ำดื่ม'])).toBe('CAFE-001')
  })

  test('still returns a numeric code when the shop only has an old non-numeric one', () => {
    expect(nextCafeSku(['CAFE-ESP-HOT'])).toBe('CAFE-001')
  })

  test('keeps the three digit shape across the boundary', () => {
    const codes = (upTo: number) => Array.from({ length: upTo }, (_, index) => `CAFE-${String(index + 1).padStart(3, '0')}`)
    expect(nextCafeSku(codes(9))).toBe('CAFE-010')
    expect(nextCafeSku(codes(99))).toBe('CAFE-100')
    expect(nextCafeSku(codes(999))).toBe('CAFE-1000')
  })

  test('ignores surrounding whitespace', () => {
    expect(nextCafeSku([' CAFE-001 '])).toBe('CAFE-002')
  })

  test('counts a differently padded code as the same number', () => {
    expect(nextCafeSku(['CAFE-0001'])).toBe('CAFE-002')
  })
})
