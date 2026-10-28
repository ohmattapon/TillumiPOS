// Image store for the POS, backed by R2.
//   GET    /<key>  public, cached at the edge
//   PUT    /<key>  requires `Authorization: Bearer <MEDIA_TOKEN>`; only the POS API holds the token
//   DELETE /<key>  same token

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024
// Lowercase path segments ending in an image extension; rules out traversal and odd characters.
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.(jpg|png|webp)$/
// Keys are never reused (the API generates a fresh one per upload), so responses can be cached forever.
const CACHE_CONTROL = 'public, max-age=31536000, immutable'

const json = (status: number, message: string) => Response.json({ message }, { status })

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  if (!env.MEDIA_TOKEN) return false
  const encoder = new TextEncoder()
  // Hash both sides so the comparison is constant-time regardless of length.
  const [given, expected] = await Promise.all(
    [request.headers.get('authorization') ?? '', `Bearer ${env.MEDIA_TOKEN}`].map((value) =>
      crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
  )
  return crypto.subtle.timingSafeEqual(given!, expected!)
}

async function serve(request: Request, env: Env, ctx: ExecutionContext, key: string): Promise<Response> {
  const cache = caches.default
  const cached = await cache.match(request)
  if (cached) return cached

  const object = await env.BUCKET.get(key, { onlyIf: request.headers })
  if (!object) return json(404, 'Not found')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', CACHE_CONTROL)
  // Images are public. Reads must be allowed cross-origin so the web can draw the shop logo into a PDF or a printer bitmap.
  headers.set('access-control-allow-origin', '*')

  // No body means the client's copy is still current (If-None-Match matched).
  if (!('body' in object)) return new Response(null, { status: 304, headers })

  const response = new Response(request.method === 'HEAD' ? null : object.body, { headers })
  if (request.method === 'GET') ctx.waitUntil(cache.put(request, response.clone()))
  return response
}

async function upload(request: Request, env: Env, key: string): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!ALLOWED_TYPES.has(contentType)) return json(415, 'Only JPEG, PNG and WebP images are accepted')

  const length = Number(request.headers.get('content-length'))
  if (!request.body || !Number.isInteger(length) || length <= 0) return json(411, 'Content-Length is required')
  if (length > MAX_BYTES) return json(413, 'Image is larger than 5 MB')

  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType, cacheControl: CACHE_CONTROL } })
  return Response.json({ key }, { status: 201 })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const key = new URL(request.url).pathname.slice(1)
    if (!KEY_PATTERN.test(key)) return json(404, 'Not found')

    if (request.method === 'GET' || request.method === 'HEAD') return serve(request, env, ctx, key)

    if (request.method !== 'PUT' && request.method !== 'DELETE')
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } })
    if (!(await isAuthorized(request, env))) return json(401, 'Unauthorized')

    if (request.method === 'PUT') return upload(request, env, key)

    await env.BUCKET.delete(key)
    return new Response(null, { status: 204 })
  },
} satisfies ExportedHandler<Env>
