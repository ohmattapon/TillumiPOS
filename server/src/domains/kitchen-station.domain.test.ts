import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { KitchenStationEntity } from './kitchen-station.domain'

const codeOf = (action: () => unknown): string | undefined => {
  try {
    action()
    return undefined
  } catch (error) {
    return (error as DomainError).code
  }
}

const station = (name: string, sortOrder = 0) => ({ id: 1, name, sortOrder, isActive: true })

describe('KitchenStationEntity', () => {
  test('ชื่อถูกตัดช่องว่าง', () => {
    expect(new KitchenStationEntity(station('  ครัว  ')).name).toBe('ครัว')
  })

  test('ชื่อว่าง หรือยาวเกิน 50 ตัวอักษร ถูกปฏิเสธ', () => {
    expect(codeOf(() => new KitchenStationEntity(station('   ')))).toBe('INVALID_KITCHEN_STATION')
    expect(codeOf(() => new KitchenStationEntity(station('x'.repeat(51))))).toBe('INVALID_KITCHEN_STATION')
  })

  test('ลำดับต้องเป็นจำนวนเต็ม', () => {
    expect(codeOf(() => new KitchenStationEntity(station('ครัว', 1.5)))).toBe('INVALID_KITCHEN_STATION')
  })

  test('with เปลี่ยนเฉพาะฟิลด์ที่ส่งมา และคงรหัสเดิม', () => {
    const changed = new KitchenStationEntity(station('ครัว')).with({ isActive: false })

    expect(changed.id).toBe(1)
    expect(changed.name).toBe('ครัว')
    expect(changed.isActive).toBe(false)
  })
})
