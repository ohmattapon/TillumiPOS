import { describe, expect, test } from 'bun:test'
import { NodeUpdateHasher } from './update-hasher.adapter'

describe('NodeUpdateHasher', () => {
  test('hashes the well-known "abc" vector', () => {
    expect(new NodeUpdateHasher().sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  test('answers lowercase hex and differs per input', () => {
    const hasher = new NodeUpdateHasher()
    const digest = hasher.sha256Hex(new TextEncoder().encode('tillumi'))
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toBe(hasher.sha256Hex(new TextEncoder().encode('tillumi!')))
  })
})
