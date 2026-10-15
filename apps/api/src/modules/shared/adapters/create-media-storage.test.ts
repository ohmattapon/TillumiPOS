import { describe, expect, test } from 'bun:test'
import { createMediaStorage } from './create-media-storage'
import { LocalDiskMediaStorage } from './local-disk-media-storage'
import { WorkerMediaStorage } from './worker-media-storage'

const base = { mediaDir: '/tmp/x', mediaUrl: null, mediaToken: null }

describe('createMediaStorage', () => {
  test('local keeps images on disk', () => {
    expect(createMediaStorage({ ...base, mediaStorage: 'local' })).toBeInstanceOf(LocalDiskMediaStorage)
  })

  test('worker uses the image Worker', () => {
    const storage = createMediaStorage({ ...base, mediaStorage: 'worker', mediaUrl: 'https://m.example.com', mediaToken: 't' })

    expect(storage).toBeInstanceOf(WorkerMediaStorage)
    expect(storage.urlFor('products/1/a.png')).toBe('https://m.example.com/products/1/a.png')
  })

  test('none is disabled: no URLs and nothing can be stored', async () => {
    const storage = createMediaStorage({ ...base, mediaStorage: 'none' })

    expect(storage.isEnabled()).toBe(false)
    expect(storage.urlFor('products/1/a.png')).toBeNull()
    await expect(storage.put('products/1/a.png', new Blob(['x']))).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
  })
})
