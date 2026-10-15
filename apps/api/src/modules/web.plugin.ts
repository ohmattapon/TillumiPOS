import { stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Elysia, NotFoundError } from 'elysia'

const isFile = async (path: string) => (await stat(path).catch(() => null))?.isFile() ?? false

/**
 * Serves the web app built into `root`, so one process is the whole shop: a file when the path names
 * one, otherwise index.html for the routes the app draws itself. Anything under /api or /openapi that
 * no route answered stays a 404.
 */
export function webPlugin(root: string | undefined) {
  const plugin = new Elysia({ name: 'web' })
  if (!root) return plugin

  const base = resolve(root)
  const index = join(base, 'index.html')

  return plugin.get('/*', async ({ path }) => {
    if (path === '/api' || path.startsWith('/api/') || path.startsWith('/openapi')) throw new NotFoundError()

    let target: string
    try {
      target = resolve(base, `.${decodeURIComponent(path)}`)
    } catch {
      throw new NotFoundError()
    }
    // Never outside the folder that was built, whatever the path says.
    if (target !== base && !target.startsWith(base + sep)) throw new NotFoundError()

    if (await isFile(target)) {
      // Built files carry a hash in their name, so they never change; the page itself must be re-read.
      return new Response(Bun.file(target), {
        headers: { 'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' },
      })
    }
    return new Response(Bun.file(index), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
    })
  })
}
