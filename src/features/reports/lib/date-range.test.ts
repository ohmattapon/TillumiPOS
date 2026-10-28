import { expect, test } from 'bun:test'
import { calendarDate, presetRange, validRange } from './date-range'
test('presets handle year boundaries and leap February', () => {
  expect(presetRange('week', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' })
  expect(presetRange('previousMonth', '2024-03-31')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  expect(presetRange('previousMonth', '2026-01-31')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
})
test('rejects impossible dates and ranges beyond 366 days', () => {
  expect(validRange('2026-02-30', '2026-03-01')).toBe(false)
  expect(validRange('2026-03-01', '2026-02-01')).toBe(false)
  expect(validRange('2024-01-01', '2024-12-31')).toBe(true)
  expect(validRange('2024-01-01', '2025-01-01')).toBe(false)
})
test('normalizes treaty-decoded Date fields without shifting the calendar day', () => {
  expect(calendarDate(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01')
  expect(calendarDate('2026-01-01')).toBe('2026-01-01')
})
