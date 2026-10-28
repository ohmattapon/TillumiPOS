import { resolve, sep } from 'node:path'
import { Elysia, NotFoundError } from 'elysia'
import { contentTypeOf, logoContentTypeOf, slideContentTypeOf } from './shared/adapters/local-disk-media-storage'

const PREFIX = '/media/'

/**
 * Serves the product images kept on this machine's disk at /media/<key>. Public like the image Worker:
 * a picture of a product is not a secret, and each upload has its own unguessable key, so it can be cached forever.
 */
export function mediaPlugin(directory: string | null) {
  const plugin = new Elysia({ name: 'media' })
  if (directory === null) return plugin
  const base = resolve(directory)

  return plugin.get(`${PREFIX}*`, async ({ path, request }) => {
    const key = path.slice(PREFIX.length)
    // Only the shapes the uploads produce are ever read; an encoded or relative path fails here.
    const type = contentTypeOf(key) ?? slideContentTypeOf(key) ?? logoContentTypeOf(key)
    if (type === null) throw new NotFoundError()
    const target = resolve(base, key)
    if (!target.startsWith(base + sep)) throw new NotFoundError()

    const file = Bun.file(target)
    if (!(await file.exists())) throw new NotFoundError()

    const headers = {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${file.size}-${file.lastModified}"`,
    }
    if (request.headers.get('if-none-match') === headers.etag) return new Response(null, { status: 304, headers })
    return new Response(file, { headers })
  })
}
