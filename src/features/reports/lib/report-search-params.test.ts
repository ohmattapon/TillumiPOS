import { describe, expect, test } from 'bun:test'
import { readReportSearch, writeReportSearch, type ReportSearch } from './report-search-params'

const TODAY = '2026-10-29'
const read = (query: string) => readReportSearch(new URLSearchParams(query), TODAY)

describe('readReportSearch', () => {
  test('an empty query gives this month, the overview tab and sorting by quantity', () => {
    expect(read('')).toEqual({ from: '2026-10-01', to: TODAY, compare: false, tab: 'overview', sort: 'quantity' })
  })
  test('a round trip keeps every field', () => {
    const search: ReportSearch = {
      from: '2026-09-01', to: '2026-09-30', cashierId: 7, customer: 'member', compare: true,
      tab: 'items', categoryId: 12, sort: 'margin',
    }
    expect(read(writeReportSearch(search).toString())).toEqual(search)
  })
  test('tab=bogus gives overview and sort=bogus gives quantity', () => {
    expect(read('tab=bogus&sort=bogus')).toMatchObject({ tab: 'overview', sort: 'quantity' })
  })
  test('cashierId=abc drops the field, and so does a non-positive or fractional id', () => {
    for (const bad of ['abc', '0', '-3', '1.5', '']) expect('cashierId' in read(`cashierId=${bad}`)).toBe(false)
  })
  test('customer keeps member and guest and drops anything else', () => {
    expect(read('customer=guest').customer).toBe('guest')
    expect('customer' in read('customer=all')).toBe(false)
  })
  test('categoryId=none keeps the word none', () => {
    expect(read('categoryId=none').categoryId).toBe('none')
    expect(read('categoryId=5').categoryId).toBe(5)
    expect('categoryId' in read('categoryId=0')).toBe(false)
  })
  test('compare=1 and compare=true give true, anything else gives false', () => {
    expect(read('compare=1').compare).toBe(true)
    expect(read('compare=true').compare).toBe(true)
    expect(read('compare=0').compare).toBe(false)
    expect(read('compare=yes').compare).toBe(false)
  })
})

describe('writeReportSearch', () => {
  test('writes only the dates for the default view, so a plain link stays short', () => {
    const query = writeReportSearch({ from: '2024-02-01', to: '2024-02-29', compare: false, tab: 'overview', sort: 'quantity' })
    expect(query.toString()).toBe('from=2024-02-01&to=2024-02-29')
  })
  test('writes compare as 1', () => {
    const query = writeReportSearch({ from: '2024-02-01', to: '2024-02-29', compare: true, tab: 'overview', sort: 'quantity' })
    expect(query.get('compare')).toBe('1')
  })
})
