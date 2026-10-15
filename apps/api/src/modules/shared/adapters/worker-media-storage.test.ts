import { describe, expect, test } from 'bun:test'
import { WorkerMediaStorage } from './worker-media-storage'

describe('WorkerMediaStorage', () => {
  test('without a Worker URL and token it is disabled, has no URLs, and refuses to store', async () => {
    const storage = new WorkerMediaStorage({ mediaUrl: null, mediaToken: null })

    expect(storage.isEnabled()).toBe(false)
    expect(storage.urlFor('a.png')).toBeNull()
    await expect(storage.put('a.png', new Blob(['x']))).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    await expect(storage.delete('a.png')).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
  })

  test('with both it builds public URLs from the Worker URL', () => {
    const storage = new WorkerMediaStorage({ mediaUrl: 'https://media.example.com', mediaToken: 'token' })

    expect(storage.isEnabled()).toBe(true)
    expect(storage.urlFor('products/1.png')).toBe('https://media.example.com/products/1.png')
  })

  test('a URL without a token is not enough', () => {
    expect(new WorkerMediaStorage({ mediaUrl: 'https://media.example.com', mediaToken: null }).isEnabled()).toBe(false)
  })
})
