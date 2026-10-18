import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { mediaPlugin } from '../../media.plugin'

let parent: string
let directory: string

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'easypos-slides-'))
  directory = join(parent, 'media')
  await mkdir(join(directory, 'slides'), { recursive: true })
  await writeFile(join(directory, 'slides', '550e8400-e29b-41d4-a716-446655440000.png'), 'SLIDEBYTES')
  // A file next to the media folder must stay unreachable.
  await writeFile(join(parent, 'secret.txt'), 'secret')
  // Files that exist inside the folder but are not slide image keys must not be served either.
  await writeFile(join(directory, 'notes.txt'), 'notes')
})
afterEach(() => rm(parent, { recursive: true, force: true }))

const get = (app: Elysia, path: string, headers: Record<string, string> = {}) =>
  app.handle(new Request(`http://localhost${path}`, { headers }))

describe('mediaPlugin slides', () => {
  test('serves a stored slide image with its type and a cache that never expires', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    const response = await get(app, '/media/slides/550e8400-e29b-41d4-a716-446655440000.png')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('SLIDEBYTES')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  test('paths that try to leave the folder are a 404, plain or encoded', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    for (const path of [
      '/media/slides/../secret.txt',
      '/media/slides/%2e%2e/secret.txt',
      '/media/slides/..%2f..%2fsecret.txt',
      '/media/slides/upper.PNG',
    ]) expect((await get(app, path)).status).toBe(404)
  })

  test('a file that exists in the folder but is not a slide image key is a 404', async () => {
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/media/notes.txt')).status).toBe(404)
  })

  test('product images keep working alongside slides', async () => {
    await mkdir(join(directory, 'products', '1'), { recursive: true })
    await writeFile(join(directory, 'products', '1', 'a.png'), 'PNGBYTES')
    const app = new Elysia().use(mediaPlugin(directory))

    expect((await get(app, '/media/products/1/a.png')).status).toBe(200)
    expect((await get(app, '/media/slides/550e8400-e29b-41d4-a716-446655440000.png')).status).toBe(200)
  })
})
