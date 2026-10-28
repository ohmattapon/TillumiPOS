import { describe, expect, test } from 'bun:test'
import { newIdempotencyKey, withIdempotencyKey } from './idempotency-key'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newIdempotencyKey', () => {
  test('is a UUID the API accepts as an Idempotency-Key', () => {
    expect(newIdempotencyKey()).toMatch(UUID)
  })

  test('is new every time', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})

describe('withIdempotencyKey', () => {
  test('sends the key it is given, so a retry repeats the same command', () => {
    expect(withIdempotencyKey('abc')).toEqual({ headers: { 'idempotency-key': 'abc' } })
  })

  test('makes a new key when none is given', () => {
    const { headers } = withIdempotencyKey()
    expect(headers['idempotency-key']).toMatch(UUID)
    expect(withIdempotencyKey().headers['idempotency-key']).not.toBe(headers['idempotency-key'])
  })
})
