import { describe, expect, test } from 'bun:test'
import { resolveMediaStorage } from './media-storage-mode'

describe('resolveMediaStorage', () => {
  test('nothing set: the shop keeps images on its own disk', () => {
    expect(resolveMediaStorage({})).toBe('local')
  })

  test('a Worker URL and token without a choice keeps using the Worker', () => {
    expect(resolveMediaStorage({ MEDIA_URL: 'https://m.example.com', MEDIA_TOKEN: 't' })).toBe('worker')
  })

  test('a URL without a token is not a Worker setup', () => {
    expect(resolveMediaStorage({ MEDIA_URL: 'https://m.example.com' })).toBe('local')
  })

  test('an explicit choice wins over what else is set', () => {
    expect(resolveMediaStorage({ MEDIA_STORAGE: 'local', MEDIA_URL: 'https://m.example.com', MEDIA_TOKEN: 't' })).toBe('local')
    expect(resolveMediaStorage({ MEDIA_STORAGE: 'none' })).toBe('none')
  })

  test('worker without both its URL and token stops the start with a clear message', () => {
    expect(() => resolveMediaStorage({ MEDIA_STORAGE: 'worker' })).toThrow(/MEDIA_URL and MEDIA_TOKEN/)
  })

  test('an unknown value stops the start instead of silently losing the images', () => {
    expect(() => resolveMediaStorage({ MEDIA_STORAGE: 'r2' })).toThrow(/MEDIA_STORAGE must be local, worker or none/)
  })

  test('an empty value counts as not set', () => {
    expect(resolveMediaStorage({ MEDIA_STORAGE: '' })).toBe('local')
  })
})
