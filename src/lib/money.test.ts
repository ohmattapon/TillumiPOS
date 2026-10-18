import { describe, expect, test } from 'bun:test'
import { createDateFormat, createMoney } from './money'

describe('createMoney: Thai baht', () => {
  const baht = createMoney('THB', 'th')

  test('has two fraction digits', () => {
    expect(baht.fractionDigits).toBe(2)
  })

  test('formats minor units with a symbol, thousands separators and two decimals', () => {
    expect(baht.format(125_000)).toBe('฿1,250.00')
    expect(baht.format(5)).toBe('฿0.05')
  })

  test('plain leaves the symbol off', () => {
    expect(baht.plain(125_000)).toBe('1,250.00')
  })

  test.each([
    ['15', 1500],
    ['1,250.5', 125_050],
    ['  7.50 ', 750],
    ['0', 0],
    ['0.005', 1], // half a satang rounds up
  ])('parses %p as %p minor units', (input, minor) => {
    expect(baht.parse(input)).toBe(minor)
  })

  test.each(['', '   ', 'abc', '-1', '1.2.3', 'Infinity'])('rejects %p', (input) => {
    expect(baht.parse(input)).toBeNull()
  })

  test('toInput gives back what parse accepts', () => {
    for (const minor of [0, 5, 1500, 125_050]) expect(baht.parse(baht.toInput(minor))).toBe(minor)
    expect(baht.toInput(125_000)).toBe('1250')
  })
})

describe('createMoney: other currencies', () => {
  test('a currency without a minor unit has no fraction digits and is not scaled', () => {
    const yen = createMoney('JPY', 'en')

    expect(yen.fractionDigits).toBe(0)
    expect(yen.parse('1500')).toBe(1500)
    expect(yen.plain(1500)).toBe('1,500')
    expect(yen.toInput(1500)).toBe('1500')
  })

  test('US dollars use two decimals and the English number format', () => {
    const dollars = createMoney('USD', 'en')

    expect(dollars.fractionDigits).toBe(2)
    expect(dollars.format(1_234_567)).toBe('$12,345.67')
  })

  test('the same amount reads differently in each language but is the same number', () => {
    const th = createMoney('THB', 'th')
    const en = createMoney('THB', 'en')

    expect(th.parse('12.5')).toBe(en.parse('12.5'))
  })
})

describe('createDateFormat', () => {
  const at = new Date('2026-10-13T06:30:00Z')

  test('Thai output uses the Buddhist era', () => {
    expect(createDateFormat('th').longDate(at)).toContain('ตุลาคม')
    expect(createDateFormat('th').dateTime(at)).toContain('69')
  })

  test('English output names the month in English', () => {
    expect(createDateFormat('en').longDate(at)).toContain('October')
  })

  test('a calendar day from the API is the same day in any browser zone', () => {
    // The API's calendar days are midnight UTC; a zone behind UTC must not turn the 13th into the 12th.
    expect(createDateFormat('en').calendarDayMonth('2026-10-13')).toBe('Oct 13')
    expect(createDateFormat('th').calendarDayMonth('2026-10-13')).toContain('13')
    expect(createDateFormat('en').calendarDateShortYear('2026-10-13')).toBe('Oct 13, 26')
    expect(createDateFormat('th').calendarDateShortYear('2026-10-13')).toContain('69')
  })

  test('accepts the ISO strings the API sends', () => {
    expect(createDateFormat('en').time('2026-10-13T06:30:00.000Z')).toMatch(/\d/)
  })

  test('calendar values retain their day and use the locale year consistently', () => {
    expect(createDateFormat('th').calendarDate('2026-01-01')).toContain('1 ม.ค. 2569')
    expect(createDateFormat('th').calendarYear('2026-01-01')).toBe('2569')
    expect(createDateFormat('en').calendarDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(createDateFormat('en').calendarYear('2026-01-01')).toBe('2026')
  })
})
