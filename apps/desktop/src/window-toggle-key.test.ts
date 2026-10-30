import { describe, expect, test } from 'bun:test'
import type { KeyInput } from './owner-shortcut'
import { isWindowToggleKey } from './window-toggle-key'

const press: KeyInput = {
  type: 'keyDown',
  code: 'F11',
  control: false,
  shift: false,
  alt: false,
  meta: false,
  isAutoRepeat: false,
}

function withModifier(modifier: 'control' | 'shift' | 'alt' | 'meta'): KeyInput {
  return { ...press, [modifier]: true }
}

describe('isWindowToggleKey', () => {
  test('F11 switches between full screen and a window', () => {
    expect(isWindowToggleKey(press)).toBe(true)
  })

  test('Alt+Enter switches too', () => {
    const altEnter: KeyInput = { ...press, code: 'Enter', alt: true }
    expect(isWindowToggleKey(altEnter)).toBe(true)
  })

  test('F11 with any modifier on it belongs to the page', () => {
    expect(isWindowToggleKey(withModifier('control'))).toBe(false)
    expect(isWindowToggleKey(withModifier('shift'))).toBe(false)
    expect(isWindowToggleKey(withModifier('alt'))).toBe(false)
    expect(isWindowToggleKey(withModifier('meta'))).toBe(false)
  })

  test('Enter alone and Enter with another modifier do not switch', () => {
    expect(isWindowToggleKey({ ...press, code: 'Enter' })).toBe(false)
    const altShiftEnter: KeyInput = { ...press, code: 'Enter', alt: true, shift: true }
    expect(isWindowToggleKey(altShiftEnter)).toBe(false)
  })

  test('holding the key down switches once, not on every repeat', () => {
    const repeated: KeyInput = { ...press, isAutoRepeat: true }
    expect(isWindowToggleKey(repeated)).toBe(false)
  })

  test('releasing the key does nothing', () => {
    const released: KeyInput = { ...press, type: 'keyUp' }
    expect(isWindowToggleKey(released)).toBe(false)
    const altEnterReleased: KeyInput = { ...press, type: 'keyUp', code: 'Enter', alt: true }
    expect(isWindowToggleKey(altEnterReleased)).toBe(false)
  })

  test('another key does nothing', () => {
    expect(isWindowToggleKey({ ...press, code: 'F10' })).toBe(false)
  })
})
