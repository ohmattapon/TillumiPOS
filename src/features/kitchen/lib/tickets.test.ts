import { describe, expect, test } from 'bun:test'
import { isLineCancelled, isTicketCancelled, liveUnits, ticketHeading, unsentUnits } from './tickets'

describe('หน่วยที่ยังอยู่กับครัว', () => {
  test('บรรทัดที่ยกเลิกบางส่วนเหลือเท่าที่ยังไม่ถูกยกเลิก', () => {
    expect(liveUnits({ quantity: 3, voidedQuantity: 1 })).toBe(2)
    expect(isLineCancelled({ quantity: 3, voidedQuantity: 1 })).toBe(false)
  })

  test('บรรทัดที่ยกเลิกหมดถูกขีดฆ่า และใบที่ทุกบรรทัดถูกยกเลิกเป็นใบยกเลิก', () => {
    expect(isLineCancelled({ quantity: 2, voidedQuantity: 2 })).toBe(true)
    expect(isTicketCancelled([{ quantity: 2, voidedQuantity: 2 }, { quantity: 1, voidedQuantity: 1 }])).toBe(true)
    expect(isTicketCancelled([{ quantity: 2, voidedQuantity: 2 }, { quantity: 1, voidedQuantity: 0 }])).toBe(false)
  })

  test('ใบที่ไม่มีบรรทัดไม่ถือว่าถูกยกเลิก', () => {
    expect(isTicketCancelled([])).toBe(false)
  })
})

describe('ส่งครัวได้อีกเท่าไร', () => {
  test('เท่ากับจำนวนของออเดอร์ลบส่วนที่ส่งแล้ว ไม่ติดลบ', () => {
    expect(unsentUnits(5, 2)).toBe(3)
    expect(unsentUnits(2, 2)).toBe(0)
    expect(unsentUnits(1, 4)).toBe(0)
  })
})

describe('หัวของใบ', () => {
  test('ใช้ชื่อโต๊ะก่อน แล้วชื่อออเดอร์ แล้วเลขออเดอร์', () => {
    const fallback = (orderId: number) => `#${orderId}`

    expect(ticketHeading({ orderId: 7, tableName: 'T3', orderLabel: 'ป้าย' }, fallback)).toBe('T3')
    expect(ticketHeading({ orderId: 7, tableName: null, orderLabel: 'ป้าย' }, fallback)).toBe('ป้าย')
    expect(ticketHeading({ orderId: 7, tableName: null, orderLabel: null }, fallback)).toBe('#7')
  })
})
