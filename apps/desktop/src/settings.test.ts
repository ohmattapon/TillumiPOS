import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSettings, saveSettings } from './settings'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tillumi-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const file = () => join(dir, 'settings.json')

describe('settings', () => {
  test('a missing file gives the defaults', () => {
    expect(loadSettings(dir)).toEqual({ printer: null })
  })

  test('a missing folder gives the defaults', () => {
    expect(loadSettings(join(dir, 'does-not-exist'))).toEqual({ printer: null })
  })

  test('save then load returns the same printer', () => {
    saveSettings(dir, { printer: 'Receipt 80mm' })
    expect(loadSettings(dir)).toEqual({ printer: 'Receipt 80mm' })
  })

  test('a Thai printer name survives the round trip', () => {
    saveSettings(dir, { printer: 'เครื่องพิมพ์ใบเสร็จ' })
    expect(loadSettings(dir).printer).toBe('เครื่องพิมพ์ใบเสร็จ')
  })

  test('saving creates the folder when it does not exist yet', () => {
    const nested = join(dir, 'a', 'b')
    saveSettings(nested, { printer: 'X' })
    expect(loadSettings(nested)).toEqual({ printer: 'X' })
  })

  test('saving again replaces the earlier value', () => {
    saveSettings(dir, { printer: 'A' })
    saveSettings(dir, { printer: null })
    expect(loadSettings(dir)).toEqual({ printer: null })
  })

  test('the file holds the printer and nothing else', () => {
    // An extra key (a secret, say) handed in by mistake must never reach the disk.
    saveSettings(dir, { printer: 'A', password: 'secret', token: 't' } as never)
    expect(Object.keys(JSON.parse(readFileSync(file(), 'utf8')))).toEqual(['printer'])
  })

  test('corrupt JSON gives the defaults', () => {
    writeFileSync(file(), '{ not json')
    expect(loadSettings(dir)).toEqual({ printer: null })
  })

  test('an empty file gives the defaults', () => {
    writeFileSync(file(), '')
    expect(loadSettings(dir)).toEqual({ printer: null })
  })

  test('JSON of the wrong shape gives the defaults', () => {
    for (const text of ['null', '[]', '"x"', '42', '{"printer":42}', '{"printer":{}}', '{"printer":""}']) {
      writeFileSync(file(), text)
      expect(loadSettings(dir)).toEqual({ printer: null })
    }
  })

  test('keys other than printer in an existing file are ignored', () => {
    writeFileSync(file(), JSON.stringify({ printer: 'A', secret: 'x' }))
    expect(loadSettings(dir)).toEqual({ printer: 'A' })
  })
})
