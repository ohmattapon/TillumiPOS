import { expect, test } from 'bun:test'
import { fromCalendarDate, todayIn, toCalendarDate } from './calendar-date'

test.each(['2026-01-01', '2024-02-29', '2026-03-08', '2026-11-01', '0099-12-31'])(
  'keeps the civil date %s when opening and selecting a calendar day', (value) => {
    const date = fromCalendarDate(value)!
    expect(toCalendarDate(date)).toBe(value)
    expect(date.getFullYear()).toBe(Number(value.slice(0, 4)))
    expect(date.getMonth() + 1).toBe(Number(value.slice(5, 7)))
    expect(date.getDate()).toBe(Number(value.slice(8, 10)))
  },
)

test.each(['', '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z'])(
  'does not silently normalize invalid picker value %s', (value) => expect(fromCalendarDate(value)).toBeUndefined(),
)

test('serializes the selected local day rather than its UTC date', () => {
  expect(toCalendarDate(new Date(2026, 9, 15))).toBe('2026-10-15')
  expect(toCalendarDate(new Date(NaN))).toBe('')
})

test('today is the date in the shop time zone, whatever the browser zone is', () => {
  expect(todayIn('Asia/Bangkok', new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-16')
  expect(todayIn('UTC', new Date('2026-10-15T17:30:00Z'))).toBe('2026-10-15')
  expect(todayIn('Asia/Bangkok', new Date('2026-01-01T18:00:00Z'))).toBe('2026-01-02')
  expect(todayIn('America/New_York', new Date('2026-01-01T18:00:00Z'))).toBe('2026-01-01')
})
