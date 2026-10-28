import { describe, expect, test } from 'bun:test'
import { CryptoIdGenerator } from './crypto-id-generator'

describe('CryptoIdGenerator', () => {
  test('makes ids of letters, digits and hyphens that are not repeated', () => {
    const ids = new CryptoIdGenerator()
    const made = new Set(Array.from({ length: 50 }, () => ids.newId()))

    expect(made.size).toBe(50)
    for (const id of made) expect(id).toMatch(/^[A-Za-z0-9-]+$/)
  })
})
