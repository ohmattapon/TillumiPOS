import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_WINDOW_STATE } from './window-mode'
import { loadWindowState, saveWindowState } from './window-state-file'

let dir: string
const file = () => join(dir, 'window-state.json')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tillumi-window-state-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadWindowState', () => {
  test('a missing file gives the default', () => {
    expect(loadWindowState(dir)).toEqual(DEFAULT_WINDOW_STATE)
  })

  test('a missing folder gives the default', () => {
    expect(loadWindowState(join(dir, 'nope'))).toEqual(DEFAULT_WINDOW_STATE)
  })

  test.each(['', '{', 'not json', 'null', '[]', '"window"', '{"mode":"x","width":"a"}'])('a corrupt file (%p) gives the default', (text) => {
    writeFileSync(file(), text)
    expect(loadWindowState(dir)).toEqual(DEFAULT_WINDOW_STATE)
  })

  test('a path that is a folder, not a file, gives the default', () => {
    mkdirSync(file())
    expect(loadWindowState(dir)).toEqual(DEFAULT_WINDOW_STATE)
  })

  test('out-of-range values in the file fall back like the parser says', () => {
    writeFileSync(file(), JSON.stringify({ mode: 'window', width: 10, height: 10, x: 99999, y: 0 }))
    expect(loadWindowState(dir)).toEqual({ mode: 'window', width: 1280, height: 720 })
  })
})

describe('saveWindowState', () => {
  test('what is saved is what is loaded', () => {
    const state = { mode: 'window', width: 1024, height: 600, x: 10, y: 20 } as const
    saveWindowState(dir, state)
    expect(loadWindowState(dir)).toEqual(state)
  })

  test('the file holds exactly the state keys and nothing else', () => {
    saveWindowState(dir, { mode: 'window', width: 1024, height: 600, x: 10, y: 20 })
    expect(Object.keys(JSON.parse(readFileSync(file(), 'utf8'))).sort()).toEqual(['height', 'mode', 'width', 'x', 'y'])
    saveWindowState(dir, { mode: 'kiosk', width: 1280, height: 720 })
    expect(Object.keys(JSON.parse(readFileSync(file(), 'utf8'))).sort()).toEqual(['height', 'mode', 'width'])
  })

  test('extra fields on the object passed in are never written', () => {
    const polluted = { mode: 'window', width: 1024, height: 600, printer: 'EPSON', token: 'secret', url: 'http://x' }
    saveWindowState(dir, polluted as never)
    const text = readFileSync(file(), 'utf8')
    expect(text).not.toContain('EPSON')
    expect(text).not.toContain('secret')
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['height', 'mode', 'width'])
  })

  test('an unusable state is stored as the default, never as garbage', () => {
    saveWindowState(dir, { mode: 'window', width: 5, height: 5 })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual({ ...DEFAULT_WINDOW_STATE, mode: 'window' })
  })

  test('it replaces an earlier file and leaves no temp file behind', () => {
    saveWindowState(dir, { mode: 'window', width: 1000, height: 600 })
    saveWindowState(dir, { mode: 'kiosk', width: 1100, height: 700 })
    expect(loadWindowState(dir)).toEqual({ mode: 'kiosk', width: 1100, height: 700 })
    expect(readdirSync(dir)).toEqual(['window-state.json'])
  })

  test('it creates the folder when it does not exist yet', () => {
    const nested = join(dir, 'a', 'b')
    saveWindowState(nested, { mode: 'window', width: 1000, height: 600 })
    expect(loadWindowState(nested)).toEqual({ mode: 'window', width: 1000, height: 600 })
  })
})
