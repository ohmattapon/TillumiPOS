import { expect, test } from 'bun:test'
import { reportQueryParams } from './report-query'

test('sends the dates alone when no filter is set', () => {
  expect(reportQueryParams({ from: '2026-01-01', to: '2026-01-31', compare: true })).toEqual({ from: '2026-01-01', to: '2026-01-31' })
})
test('adds the cashier and the customer kind when they are set', () => {
  expect(reportQueryParams({ from: '2026-01-01', to: '2026-01-31', compare: false, cashierId: 4, customer: 'guest' }))
    .toEqual({ from: '2026-01-01', to: '2026-01-31', cashierId: 4, customer: 'guest' })
})
