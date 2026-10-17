import { describe, expect, test } from 'bun:test'
import { defaultStationId } from './stations'

const hot = { id: 1, isActive: false }
const bar = { id: 2, isActive: true }
const cold = { id: 3, isActive: true }

describe('สถานีที่จอครัวแสดง', () => {
  test('ใช้สถานีที่ขอมา แม้สถานีนั้นพักรับอยู่ เพราะใบที่ค้างยังต้องทำให้เสร็จ', () => {
    expect(defaultStationId([hot, bar, cold], 1)).toBe(1)
    expect(defaultStationId([hot, bar, cold], 3)).toBe(3)
  })

  test('ไม่ได้ขอ หรือขอสถานีที่ไม่มี ใช้สถานีแรกที่เปิดรับอยู่', () => {
    expect(defaultStationId([hot, bar, cold], 0)).toBe(2)
    expect(defaultStationId([hot, bar, cold], Number.NaN)).toBe(2)
    expect(defaultStationId([hot, bar, cold], 99)).toBe(2)
  })

  test('ถ้าไม่มีสถานีไหนเปิดรับ ใช้สถานีแรกของทั้งหมด', () => {
    expect(defaultStationId([hot, { id: 4, isActive: false }], 0)).toBe(1)
  })

  test('ไม่มีสถานีเลยได้ 0', () => {
    expect(defaultStationId([], 5)).toBe(0)
  })
})
