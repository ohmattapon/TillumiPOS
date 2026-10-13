interface FakeMedia {
  url: string
  /** Stored objects by key, for assertions. */
  objects: Map<string, Blob>
  /** While true every request answers 503, as if the storage were down. */
  setFailing(value: boolean): void
  reset(): void
}

/** In-memory stand-in for the apps/media Worker: same contract, no network. */
function start(): FakeMedia {
  const objects = new Map<string, Blob>()
  let failing = false

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (failing) return new Response('unavailable', { status: 503 })
      const key = new URL(request.url).pathname.slice(1)

      if (request.method === 'GET') {
        const object = objects.get(key)
        return object ? new Response(object) : new Response(null, { status: 404 })
      }
      if (request.headers.get('authorization') !== `Bearer ${Bun.env.MEDIA_TOKEN}`)
        return new Response(null, { status: 401 })

      if (request.method === 'PUT') {
        objects.set(key, await request.blob())
        return Response.json({ key }, { status: 201 })
      }
      if (request.method === 'DELETE') {
        objects.delete(key)
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 405 })
    },
  })

  return {
    url: `http://localhost:${server.port}`,
    objects,
    setFailing: (value) => {
      failing = value
    },
    reset: () => {
      objects.clear()
      failing = false
    },
  }
}

// Kept on globalThis so the preload script and every test file share one server,
// whichever way the test runner caches modules.
const shared = globalThis as typeof globalThis & { __posFakeMedia?: FakeMedia }

export const fakeMedia: FakeMedia = (shared.__posFakeMedia ??= start())
