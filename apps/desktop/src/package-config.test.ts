import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const config = JSON.parse(readFileSync(join(import.meta.dir, '..', 'electron-builder.json'), 'utf8')) as Record<
  string,
  unknown
>

// Every key at every depth, so a secret cannot hide in a nested object.
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys)
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)])
}

describe('electron-builder.json', () => {
  test('builds the unpacked folder for Windows x64 only', () => {
    const win = config.win as { target: Array<{ target: string; arch: string[] }> }
    expect(win.target).toEqual([{ target: 'dir', arch: ['x64'] }])
  })

  test('packs the app into an asar archive', () => {
    expect(config.asar).toBe(true)
  })

  test('has no publish block, so nothing is ever uploaded or auto-updated', () => {
    expect('publish' in config).toBe(false)
    expect('electronUpdaterCompatibility' in config).toBe(false)
  })

  test('has no installer target', () => {
    expect('nsis' in config).toBe(false)
    expect(JSON.stringify(config)).not.toMatch(/nsis|msi|squirrel|portable/i)
  })

  test('packs only the compiled output', () => {
    expect(config.files).toEqual(['dist/**/*', 'package.json'])
  })

  test('names the artifact and the program without spaces', () => {
    expect(config.productName).toBe('TillumiPOS')
    expect(String(config.artifactName)).not.toContain(' ')
  })

  test('holds no key that looks like a secret (signing comes from the environment)', () => {
    const secretLike = /password|secret|token|certificate|cscLink|cscKey|apikey|private/i
    expect(allKeys(config).filter((key) => secretLike.test(key))).toEqual([])
  })
})

describe('beforeBuild hook', () => {
  // Without it electron-builder packs the workspace root's dependencies (200 MB) into the app.
  test('tells electron-builder that the app has no node_modules to collect', async () => {
    expect(config.beforeBuild).toBe('./before-build.cjs')
    const hook = (await import(join(import.meta.dir, '..', 'before-build.cjs'))).default as () => Promise<unknown>
    expect(await hook()).toBe(false)
  })
})

describe('shop icon', () => {
  test('win.icon points to an .ico file that holds a 256 px image', () => {
    const win = config.win as { icon: string }
    expect(win.icon).toBe('build/icon.ico')
    const ico = readFileSync(join(import.meta.dir, '..', win.icon))
    // ICONDIR: reserved 0, type 1 (icon), then the entry count; an entry width byte of 0 means 256 px.
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    const widths = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256)
    expect(widths).toContain(256)
  })
})
