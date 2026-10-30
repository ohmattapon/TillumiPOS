import { describe, expect, test } from 'bun:test'
import { isOwnerShortcut } from './owner-shortcut'

const press = {
  type: 'keyDown',
  code: 'KeyO',
  control: true,
  shift: true,
  alt: true,
  meta: false,
  isAutoRepeat: false,
}

describe('isOwnerShortcut', () => {
  test('Ctrl+Shift+Alt+O opens the owner menu', () => {
    expect(isOwnerShortcut(press)).toBe(true)
  })

  test('it uses the physical key, so a Thai keyboard layout works too', () => {
    expect(isOwnerShortcut({ ...press, code: 'KeyO' })).toBe(true)
  })

  test('every modifier is required', () => {
    expect(isOwnerShortcut({ ...press, control: false })).toBe(false)
    expect(isOwnerShortcut({ ...press, shift: false })).toBe(false)
    expect(isOwnerShortcut({ ...press, alt: false })).toBe(false)
  })

  test('an extra Windows key does not open it', () => {
    expect(isOwnerShortcut({ ...press, meta: true })).toBe(false)
  })

  test('another key does not open it', () => {
    expect(isOwnerShortcut({ ...press, code: 'KeyP' })).toBe(false)
  })

  test('holding the keys down does not count again', () => {
    expect(isOwnerShortcut({ ...press, isAutoRepeat: true })).toBe(false)
  })

  test('only the key press counts, not the release', () => {
    expect(isOwnerShortcut({ ...press, type: 'keyUp' })).toBe(false)
  })
})
