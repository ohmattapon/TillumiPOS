import { describe, expect, test } from 'bun:test'
import { newUuid } from './uuid'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** What a browser gives a page opened over plain http on the shop network: random bytes, but no randomUUID. */
const insecureContext = { getRandomValues: <T extends ArrayBufferView>(bytes: T): T => crypto.getRandomValues(bytes) }

describe('newUuid', () => {
  test('uses the browser own randomUUID when it has one', () => {
    expect(newUuid({ ...insecureContext, randomUUID: () => '11111111-1111-4111-8111-111111111111' })).toBe('11111111-1111-4111-8111-111111111111')
  })

  test('still makes a UUID where randomUUID is missing, as on http://<ip> where the page is not a secure context', () => {
    expect(newUuid(insecureContext)).toMatch(UUID)
  })

  test('the fallback sets the version and variant bits whatever the random bytes are', () => {
    for (const fill of [0x00, 0xff]) {
      const bytes = { getRandomValues: <T extends ArrayBufferView>(view: T): T => (new Uint8Array(view.buffer, view.byteOffset, view.byteLength).fill(fill), view) }

      expect(newUuid(bytes)).toMatch(UUID)
    }
  })

  test('the fallback is new every time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newUuid(insecureContext)))

    expect(seen.size).toBe(200)
  })
})
