import { describe, expect, test } from 'bun:test'
import { choosePrinter } from './printers'

const available = [
  { name: 'Front desk', isDefault: false },
  { name: 'Receipt', isDefault: true },
  { name: 'PDF', isDefault: false },
]

describe('choosePrinter', () => {
  test('keeps the saved printer while it is still installed', () => {
    expect(choosePrinter('PDF', available)).toBe('PDF')
  })

  test('falls back to the default printer when the saved one is gone', () => {
    expect(choosePrinter('Old printer', available)).toBe('Receipt')
    expect(choosePrinter(null, available)).toBe('Receipt')
  })

  test('falls back to the first printer when none is the default', () => {
    const none = available.map((printer) => ({ ...printer, isDefault: false }))
    expect(choosePrinter('Old printer', none)).toBe('Front desk')
    expect(choosePrinter(null, none)).toBe('Front desk')
  })

  test('answers null when no printer is installed', () => {
    expect(choosePrinter('Receipt', [])).toBeNull()
    expect(choosePrinter(null, [])).toBeNull()
  })

  test('does not treat an empty saved name as a choice', () => {
    expect(choosePrinter('', available)).toBe('Receipt')
  })
})
