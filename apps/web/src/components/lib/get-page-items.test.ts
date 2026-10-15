import { describe, expect, test } from 'bun:test'
import { getPageItems } from './get-page-items'

describe('getPageItems', () => {
  test('กลางเล่ม 20 หน้า: หน้า 6 (0-based 5) ได้ [1,…,5,6,7,…,20]', () => {
    expect(getPageItems(5, 20)).toEqual([1, '…', 5, 6, 7, '…', 20])
  })

  test('น้อยกว่า 7 หน้าโชว์หมด', () => {
    expect(getPageItems(0, 3)).toEqual([1, 2, 3])
  })

  test('หน้าสุดท้ายไม่โชว์ … หลัง', () => {
    expect(getPageItems(19, 20)).toEqual([1, '…', 18, 19, 20])
  })
})
