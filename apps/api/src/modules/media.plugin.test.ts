import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { mediaPlugin } from './media.plugin'

let parent: string
let directory: string

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'easypos-serve-'))
  directory = join(parent, 'media')
  await mkdir(join(directory, 'products', '1'), { recursive: true })
  await writeFile(join(directory, 'products', '1', 'a.png'), 'PNGBYTES')
  // A file next to the media folder must stay unreachable.
  await writeFile(join(parent, 'secret.txt'), 'secret')
  // Files that exist inside the folder but are not product image keys must not be served either.
  await writeFile(join(directory, 'notes.txt'), 'notes')
  await writeFile(join(directory, 'products', '1', 'a.svg'), '<svg/>')
})
afterEach(() => rm(parent, { recursive: true, force: true }))

const get = (app: Elysia, path: string, headers: Record<string, string> = {}) =>
  app.handle(new Request(`http://localhost${path}`, { headers }))

describe('mediaPlugin', () => {
  test('serves a stored image with its type and a cache that never expires', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    const response = await get(app, '/media/products/1/a.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('PNGBYTES')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  test('an If-None-Match that matches answers 304 with no body', async () => {
    const app = new Elysia().use(mediaPlugin(directory))
    const etag = (await get(app, '/media/products/1/a.png')).headers.get('etag')!

    const response = await get(app, '/media/products/1/a.png', { 'if-none-match': etag })

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  test('a missing image is a 404', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/media/products/1/missing.png')).status).toBe(404)
  })

  test('paths that try to leave the folder are a 404, plain or encoded', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    for (const path of [
      '/media/../secret.txt',
      '/media/products/1/../../../secret.txt',
      '/media/%2e%2e/secret.txt',
      '/media/products/1/%2e%2e%2f%2e%2e%2f%2e%2e%2fsecret.txt',
      '/media/products/1/a.png/..%2fa.png',
      '/media/secret.txt',
    ])
      expect((await get(app, path)).status).toBe(404)
  })

  test('a file that exists in the folder but is not a product image key is a 404', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/media/notes.txt')).status).toBe(404)
    expect((await get(app, '/media/products/1/a.svg')).status).toBe(404)
  })

  test('with no folder it serves nothing', async () => {
    const app = new Elysia().use(mediaPlugin(null))

    expect((await get(app, '/media/products/1/a.png')).status).toBe(404)
  })

  test('it does not answer paths outside /media', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/api/v1/health')).status).toBe(404)
  })
})
