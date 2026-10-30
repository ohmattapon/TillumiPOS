import { expect, test } from 'bun:test'
import { walkPages } from './paging.ts'

function source(total: number) {
  const calls: number[] = []
  const fetchPage = (offset: number, limit: number) => {
    calls.push(offset)
    return { rows: Math.max(0, Math.min(limit, total - offset)), total }
  }
  return { calls, fetchPage }
}

test('walks until the total is reached', () => {
  const { calls, fetchPage } = source(1050)
  expect(walkPages(fetchPage, { limit: 500, maxPages: 20 })).toEqual({ rows: 1050, pages: 3, complete: true })
  expect(calls).toEqual([0, 500, 1000])
})

test('an exact multiple does not ask for an empty extra page', () => {
  const { fetchPage } = source(1000)
  expect(walkPages(fetchPage, { limit: 500, maxPages: 20 })).toEqual({ rows: 1000, pages: 2, complete: true })
})

test('stops at the cap and says it is incomplete', () => {
  const { calls, fetchPage } = source(100_000)
  expect(walkPages(fetchPage, { limit: 500, maxPages: 4 })).toEqual({ rows: 2000, pages: 4, complete: false })
  expect(calls.length).toBe(4)
})

test('an empty report is complete after one page', () => {
  const { fetchPage } = source(0)
  expect(walkPages(fetchPage, { limit: 500, maxPages: 20 })).toEqual({ rows: 0, pages: 1, complete: true })
})

test('a failed page ends the walk as incomplete', () => {
  let calls = 0
  const result = walkPages(() => (++calls === 2 ? null : { rows: 500, total: 5000 }), { limit: 500, maxPages: 20 })
  expect(result).toEqual({ rows: 500, pages: 2, complete: false })
})

test('a page with no rows before the total stops the walk instead of looping', () => {
  expect(walkPages(() => ({ rows: 0, total: 10 }), { limit: 500, maxPages: 20 })).toEqual({ rows: 0, pages: 1, complete: false })
})
