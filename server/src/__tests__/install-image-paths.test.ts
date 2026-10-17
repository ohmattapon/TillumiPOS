import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The install image is not built by the test suite, so the paths it depends on are pinned here instead.
const root = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const dockerfile = read('Dockerfile')
const entrypoint = read('docker/entrypoint.sh')

describe('install image', () => {
  test('every file the Dockerfile copies exists', () => {
    const sources = [...dockerfile.matchAll(/^COPY\s+(.+)\s+\S+$/gm)].flatMap(([, list]) => list!.split(/\s+/))
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources.filter((source) => source !== '.')) expect(existsSync(join(root, source))).toBe(true)
  })

  test('WEB_DIST is where vite build writes', () => {
    expect(read('vite.config.ts')).not.toContain('outDir')
    expect(dockerfile).toMatch(/WEB_DIST=\/repo\/dist\b/)
    expect(dockerfile).toMatch(/^RUN bunx vite build$/m)
  })

  test('the entrypoint starts the server from server/, where its sources are', () => {
    expect(entrypoint).toMatch(/^cd \/repo\/server$/m)
    for (const [, script] of entrypoint.matchAll(/^(?:exec )?bun (\S+)$/gm)) expect(existsSync(join(root, 'server', script!))).toBe(true)
  })

  test('nothing in the image still points into apps/', () => {
    for (const file of ['Dockerfile', 'docker/entrypoint.sh', '.dockerignore']) expect(read(file)).not.toContain('apps/')
  })
})
