import { describe, expect, test } from 'bun:test'
import { orderIsGone } from './order-gone'

/** An error shaped like the one the API client throws: a plain Error carrying the HTTP status. */
const errorWithStatus = (status: number, code: string) => Object.assign(new Error(code), { status, code })

describe('orderIsGone', () => {
  test('an open order is not gone', () => {
    expect(orderIsGone({ error: null, data: { status: 'open' } })).toBe(false)
  })

  test('a paid, cancelled or merged order is gone', () => {
    for (const status of ['paid', 'cancelled', 'merged']) {
      expect(orderIsGone({ error: null, data: { status } })).toBe(true)
    }
  })

  test('a 404 means the order no longer exists', () => {
    expect(orderIsGone({ error: errorWithStatus(404, 'ORDER_NOT_FOUND') })).toBe(true)
  })

  test('a server error, sign-out or network failure keeps the order', () => {
    expect(orderIsGone({ error: errorWithStatus(500, 'INTERNAL') })).toBe(false)
    expect(orderIsGone({ error: errorWithStatus(401, 'UNAUTHORIZED') })).toBe(false)
    expect(orderIsGone({ error: new TypeError('Failed to fetch') })).toBe(false)
  })

  test('stale data with a failed refetch follows the data', () => {
    expect(orderIsGone({ error: errorWithStatus(500, 'INTERNAL'), data: { status: 'open' } })).toBe(false)
  })

  test('a 404 wins over the stale data of a loaded order', () => {
    expect(orderIsGone({ error: errorWithStatus(404, 'ORDER_NOT_FOUND'), data: { status: 'open' } })).toBe(true)
  })
})
