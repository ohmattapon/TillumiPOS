import { describe, expect, test } from 'bun:test'
import { DisabledMediaStorage } from './disabled-media-storage'

describe('DisabledMediaStorage', () => {
  const storage = new DisabledMediaStorage()

  test('is off, has no URLs, and refuses to store or delete', async () => {
    expect(storage.isEnabled()).toBe(false)
    expect(storage.urlFor()).toBeNull()
    await expect(storage.put()).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    await expect(storage.delete()).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
  })
})
