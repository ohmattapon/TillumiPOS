import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..', '..')
const manifest = await Bun.file(join(root, 'public', 'manifest.webmanifest')).json()
const html = await Bun.file(join(root, 'index.html')).text()

describe('installable web app', () => {
  test('the manifest lets a browser install the app full screen', () => {
    expect(manifest.name).toBe('TillumiPOS')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
  })

  test('every icon in the manifest exists at the size it declares', async () => {
    for (const icon of manifest.icons) {
      const file = join(root, 'public', icon.src)
      expect(existsSync(file), icon.src).toBe(true)
      const [width, height] = icon.sizes.split('x').map(Number)
      const bytes = new DataView(await Bun.file(file).arrayBuffer())
      // A PNG stores its width and height as two big-endian numbers right after the 8-byte signature and the chunk header.
      expect([bytes.getUint32(16), bytes.getUint32(20)], icon.src).toEqual([width, height])
    }
  })

  test('there is a maskable icon and one of at least 512px for the install prompt', () => {
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true)
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
  })

  test('the page links the manifest and the iPad home-screen settings', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"')
    expect(existsSync(join(root, 'public', 'icons', 'apple-touch-icon.png'))).toBe(true)
  })
})
