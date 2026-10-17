import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contentTypeOf, isMediaKey, LocalDiskMediaStorage, MAX_IMAGE_BYTES } from './local-disk-media-storage'

let directory: string
let storage: LocalDiskMediaStorage

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'easypos-media-'))
  storage = new LocalDiskMediaStorage(directory)
})
afterEach(() => rm(directory, { recursive: true, force: true }))

const png = (size = 8) => new Blob([new Uint8Array(size)], { type: 'image/png' })
const filesUnder = async () => (await readdir(directory, { recursive: true })).filter((entry) => entry.includes('.'))

describe('LocalDiskMediaStorage', () => {
  test('is always enabled and links to /media/<key>', () => {
    expect(storage.isEnabled()).toBe(true)
    expect(storage.urlFor('products/1/a.png')).toBe('/media/products/1/a.png')
  })

  test('what is put can be read back from the folder', async () => {
    await storage.put('products/1/a.png', png(16))

    const stored = Bun.file(join(directory, 'products', '1', 'a.png'))
    expect(await stored.exists()).toBe(true)
    expect(stored.size).toBe(16)
  })

  test('a type that is not JPEG, PNG or WebP is refused and nothing is written', async () => {
    const gif = new Blob(['x'], { type: 'image/gif' })

    await expect(storage.put('products/1/a.png', gif)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(await filesUnder()).toEqual([])
  })

  test('a file over 5 MB is refused and nothing is written', async () => {
    await expect(storage.put('products/1/a.png', png(MAX_IMAGE_BYTES + 1))).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
    expect(await filesUnder()).toEqual([])
  })

  test('a key outside the product or promotion image pattern is refused, so nothing can leave the folder', async () => {
    for (const key of ['../x.png', 'products/1/../../x.png', 'promotions/1/../../x.png', '/etc/passwd', 'products/1/a.png/../b.png', 'products/x/a.png', 'promotions/x/a.png', 'products/1/a.svg', 'promotions/1/a.svg', 'products/1/%2e%2e.png'])
      await expect(storage.put(key, png())).rejects.toMatchObject({ code: 'MEDIA_UNAVAILABLE' })
    expect(await filesUnder()).toEqual([])
  })

  test('delete removes the file, and a file that is not there is not an error', async () => {
    await storage.put('products/1/a.png', png())

    await storage.delete('products/1/a.png')
    await storage.delete('products/1/a.png')
    await storage.delete('../outside.png')

    expect(await filesUnder()).toEqual([])
  })

  test('replacing a key leaves no temporary file behind', async () => {
    await storage.put('products/1/a.png', png(4))
    await storage.put('products/1/a.png', png(9))

    expect(await filesUnder()).toEqual([join('products', '1', 'a.png')])
    expect(Bun.file(join(directory, 'products', '1', 'a.png')).size).toBe(9)
  })
})

describe('media keys', () => {
  test('only the product image pattern is a key, with its content type', () => {
    expect(isMediaKey('products/12/3f2c-aa.jpg')).toBe(true)
    expect(contentTypeOf('products/12/3f2c-aa.jpg')).toBe('image/jpeg')
    expect(contentTypeOf('products/12/a.webp')).toBe('image/webp')
    expect(isMediaKey('products/12/a.png/')).toBe(false)
    expect(contentTypeOf('x.png')).toBeNull()
  })

  test('the promotion image pattern is a key, with its content type', () => {
    expect(isMediaKey('promotions/12/3f2c-aa.jpg')).toBe(true)
    expect(contentTypeOf('promotions/12/3f2c-aa.jpg')).toBe('image/jpeg')
    expect(contentTypeOf('promotions/12/a.webp')).toBe('image/webp')
    expect(contentTypeOf('promotions/12/a.png')).toBe('image/png')
    expect(isMediaKey('promotions/12/a.png/')).toBe(false)
    expect(isMediaKey('promotions/12/a.svg')).toBe(false)
    expect(isMediaKey('promotions/x/a.png')).toBe(false)
  })
})
