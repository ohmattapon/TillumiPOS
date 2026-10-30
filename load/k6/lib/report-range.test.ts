import { expect, test } from 'bun:test'
import { bangkokDay, reportRange } from './report-range.ts'

// The history ends at the start of the reference day in Bangkok, so its last day is the day before.
const reference = new Date('2026-10-30T10:00:00+07:00')

test('bangkokDay uses the Bangkok calendar, not UTC', () => {
  expect(bangkokDay(new Date('2026-10-29T18:30:00Z'))).toBe('2026-10-30')
  expect(bangkokDay(new Date('2026-10-29T16:59:00Z'))).toBe('2026-10-29')
})

test('day is the last day of history', () => {
  expect(reportRange('day', reference)).toEqual({ from: '2026-10-29', to: '2026-10-29' })
})

test('month is 30 days and year is 365 days ending on the last day of history', () => {
  expect(reportRange('month', reference)).toEqual({ from: '2026-09-30', to: '2026-10-29' })
  expect(reportRange('year', reference)).toEqual({ from: '2025-10-30', to: '2026-10-29' })
})

test('ranges cross month and year ends', () => {
  expect(reportRange('month', new Date('2026-01-03T09:00:00+07:00'))).toEqual({ from: '2025-12-04', to: '2026-01-02' })
  expect(reportRange('day', new Date('2026-03-01T00:30:00+07:00'))).toEqual({ from: '2026-02-28', to: '2026-02-28' })
})
