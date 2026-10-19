import { describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { applyUpdateSchema, updateFeedSchema } from './update-schemas'

const good = {
  version: '1.0.1',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  url: 'https://github.com/ohmattapon/TillumiPOS/releases/download/v1.0.1/TillumiPOS-update-1.0.1.zip',
}

describe('updateFeedSchema', () => {
  test('accepts a well-formed feed entry', () => {
    expect(updateFeedSchema.parse(good)).toEqual(good)
  })

  test('strips documentation keys such as the template _note', () => {
    expect(updateFeedSchema.parse({ ...good, _note: 'publish notes' })).toEqual(good)
  })

  test.each([
    ['missing version', { ...good, version: undefined }],
    ['non-triple version', { ...good, version: 'v1.0.1' }],
    ['prerelease version', { ...good, version: '1.0.1-beta' }],
    ['short hash', { ...good, sha256: 'abcd' }],
    ['non-hex hash', { ...good, sha256: 'z'.repeat(64) }],
    ['http url', { ...good, url: 'http://example.com/update.zip' }],
    ['non-url', { ...good, url: 'not-a-url' }],
    ['missing url', { ...good, url: undefined }],
    ['null body', null],
    ['array body', []],
    ['empty object', {}],
  ])('rejects the bad feed shape: %s', (_label, body) => {
    expect(() => updateFeedSchema.parse(body)).toThrow(ZodError)
  })
})

describe('applyUpdateSchema', () => {
  test('accepts an empty apply (undefined or {})', () => {
    expect(applyUpdateSchema.parse(undefined)).toBeUndefined()
    expect(applyUpdateSchema.parse({})).toEqual({})
  })

  test('rejects any client-supplied field', () => {
    expect(() => applyUpdateSchema.parse({ url: 'https://evil.example/x.zip' })).toThrow(ZodError)
  })
})
