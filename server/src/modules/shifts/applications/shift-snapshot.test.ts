import { describe, expect, test } from 'bun:test'
import { makeShift } from '../../../__tests__/factories'
import { ShiftCashEntryEntity } from '../../../domains/shift-cash-entry.domain'
import { restoreCashEntrySnapshot, restoreShiftSnapshot } from './shift-snapshot'

/** A stored command result went through JSON, so every date comes back as text. */
const throughJson = <T>(value: T): unknown => JSON.parse(JSON.stringify(value))

describe('restoreShiftSnapshot', () => {
  test('turns the dates of an open shift back into Date objects', () => {
    const shift = makeShift()

    const restored = restoreShiftSnapshot(throughJson({ ...shift }))

    expect(restored.openedAt).toEqual(shift.openedAt)
    expect(restored.closingStartedAt).toBeNull()
    expect(restored.closedAt).toBeNull()
  })

  test('turns the closing and closed dates back too', () => {
    const shift = makeShift({
      status: 'closed',
      closingStartedAt: new Date('2026-03-01T11:00:00Z'),
      closedAt: new Date('2026-03-01T11:30:00Z'),
    })

    const restored = restoreShiftSnapshot(throughJson({ ...shift }))

    expect(restored.closingStartedAt).toEqual(new Date('2026-03-01T11:00:00Z'))
    expect(restored.closedAt).toEqual(new Date('2026-03-01T11:30:00Z'))
  })
})

describe('restoreCashEntrySnapshot', () => {
  test('restores the entry with its creation time as a Date', () => {
    const entry = new ShiftCashEntryEntity({
      id: 5,
      shiftId: 7,
      kind: 'cash_in',
      amountSatang: 5_000,
      saleId: null,
      actorId: 1,
      actorName: 'เจ้าของร้าน',
      reason: 'เติมทอน',
      createdAt: new Date('2026-03-01T04:00:00Z'),
    })

    const restored = restoreCashEntrySnapshot(throughJson({ ...entry }))

    expect(restored).toBeInstanceOf(ShiftCashEntryEntity)
    expect(restored.createdAt).toEqual(new Date('2026-03-01T04:00:00Z'))
    expect(restored.amountSatang).toBe(5_000)
  })
})
