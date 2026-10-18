import { describe, expect, test } from 'bun:test'
import { isForeignKeyViolation, isUniqueViolation, violatedConstraint } from './pg-error'

/** Drizzle throws its own error and keeps the driver's error on `cause`. */
const wrapped = (cause: object) => Object.assign(new Error('Failed query'), { cause })

describe('pg-error', () => {
  test('reads the violation code from the driver error, wrapped or not', () => {
    expect(isUniqueViolation({ errno: '23505' })).toBe(true)
    expect(isUniqueViolation(wrapped({ errno: '23505' }))).toBe(true)
    expect(isForeignKeyViolation(wrapped({ errno: '23503' }))).toBe(true)
    expect(isUniqueViolation(wrapped({ errno: '23503' }))).toBe(false)
  })

  test('names the constraint that was broken, wrapped or not', () => {
    expect(violatedConstraint({ constraint: 'one_refund' })).toBe('one_refund')
    expect(violatedConstraint(wrapped({ constraint: 'one_refund' }))).toBe('one_refund')
  })

  test('anything that is not a database violation has no constraint', () => {
    expect(violatedConstraint(new Error('boom'))).toBeNull()
    expect(violatedConstraint(null)).toBeNull()
    expect(violatedConstraint(wrapped({ constraint: 7 }))).toBeNull()
    expect(isUniqueViolation(null)).toBe(false)
  })
})
