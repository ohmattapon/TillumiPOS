import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { Elysia } from 'elysia'
import { webPlugin } from './web.plugin'

let parent: string
let root: string
let secretName: string
let app: { handle(request: Request): Response | Promise<Response> }

beforeAll(async () => {
  parent = await mkdtemp(join(tmpdir(), 'easypos-web-'))
  root = join(parent, 'dist')
  await mkdir(join(root, 'assets'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<html>EasyPOS</html>')
  await writeFile(join(root, 'assets', 'app.js'), 'console.log(1)')
  // A file beside the web root that must never be reachable.
  secretName = 'secret.txt'
  await writeFile(join(parent, secretName), 'secret')
  app = new Elysia().get('/api/v1/health', () => ({ status: 'ok' })).use(webPlugin(root))
})

afterAll(() => rm(parent, { recursive: true, force: true }))

const get = (path: string) => app.handle(new Request(`http://localhost${path}`))

describe('webPlugin', () => {
  test('serves the page at the root and for any route of the web app', async () => {
    for (const path of ['/', '/today', '/products/12']) {
      const response = await get(path)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('<html>EasyPOS</html>')
    }
  })

  test('serves built files as they are', async () => {
    const response = await get('/assets/app.js')

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('console.log(1)')
  })

  test('an API route is left to the API, and an unknown one is a 404, not the page', async () => {
    expect(await (await get('/api/v1/health')).json()).toEqual({ status: 'ok' })

    const unknown = await get('/api/v1/nope')
    expect(unknown.status).toBe(404)
    expect(await unknown.text()).not.toContain('EasyPOS')
  })

  test('cannot read outside the web root', async () => {
    for (const path of [`/../${secretName}`, `/%2e%2e/${secretName}`, `/assets/../../${secretName}`, `/..%2f${secretName}`]) {
      const response = await get(path)
      expect(await response.text(), path).not.toBe('secret')
    }
    expect(basename(root)).toBe('dist')
  })

  test('without a web root it adds nothing', async () => {
    const bare = new Elysia().use(webPlugin(undefined))

    expect((await bare.handle(new Request('http://localhost/'))).status).toBe(404)
  })
})
