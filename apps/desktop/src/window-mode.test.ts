import { describe, expect, test } from 'bun:test'
import { DEFAULT_WINDOW_STATE, nextModeAfterToggle, parseWindowState } from './window-mode'

describe('DEFAULT_WINDOW_STATE', () => {
  test('the shop starts full screen, with a 1280x720 window ready for the first time it is left', () => {
    expect(DEFAULT_WINDOW_STATE).toEqual({ mode: 'kiosk', width: 1280, height: 720 })
  })
})

describe('parseWindowState', () => {
  test('a valid object round-trips, with or without a position', () => {
    const withPosition = { mode: 'window', width: 1024, height: 600, x: 40, y: -20 } as const
    expect(parseWindowState(withPosition)).toEqual(withPosition)
    const without = { mode: 'kiosk', width: 1920, height: 1080 } as const
    expect(parseWindowState(without)).toEqual(without)
  })

  test('a state survives a JSON round trip unchanged', () => {
    const state = { mode: 'window', width: 800, height: 500, x: 0, y: 0 } as const
    expect(parseWindowState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  test.each([[undefined], [null], ['window'], [42], [true], [[]], [[1, 2]]])('a non-object (%p) gives the default', (raw) => {
    expect(parseWindowState(raw)).toEqual(DEFAULT_WINDOW_STATE)
  })

  test('an empty object gives the default', () => {
    expect(parseWindowState({})).toEqual(DEFAULT_WINDOW_STATE)
  })

  test.each(['fullscreen', 'WINDOW', '', 1, null, undefined])('a bad mode (%p) falls back to the default mode', (mode) => {
    expect(parseWindowState({ mode, width: 1000, height: 600 }).mode).toBe('kiosk')
  })

  test.each([639, 7681, 1000.5, Number.NaN, Number.POSITIVE_INFINITY, '1000', null, undefined])(
    'a bad width (%p) falls back to the default size',
    (width) => {
      expect(parseWindowState({ mode: 'window', width, height: 600 })).toEqual({ mode: 'window', width: 1280, height: 720 })
    },
  )

  test.each([479, 4321, 600.5, Number.NaN, '600', null, undefined])('a bad height (%p) falls back to the default size', (height) => {
    expect(parseWindowState({ mode: 'window', width: 1000, height })).toEqual({ mode: 'window', width: 1280, height: 720 })
  })

  test('the size limits are inclusive', () => {
    expect(parseWindowState({ mode: 'window', width: 640, height: 480 })).toMatchObject({ width: 640, height: 480 })
    expect(parseWindowState({ mode: 'window', width: 7680, height: 4320 })).toMatchObject({ width: 7680, height: 4320 })
  })

  test('a position outside -10000..10000, fractional or not a number is dropped (both x and y)', () => {
    const base = { mode: 'window', width: 1000, height: 600 } as const
    for (const bad of [{ x: 10001, y: 0 }, { x: 0, y: -10001 }, { x: 1.5, y: 0 }, { x: 'a', y: 0 }, { x: 5 }, { y: 5 }, { x: Number.NaN, y: 1 }]) {
      expect(parseWindowState({ ...base, ...bad })).toEqual(base)
    }
  })

  test('the position limits are inclusive', () => {
    expect(parseWindowState({ mode: 'window', width: 1000, height: 600, x: -10000, y: 10000 })).toMatchObject({ x: -10000, y: 10000 })
  })

  test('unknown fields are never carried over', () => {
    const parsed = parseWindowState({ mode: 'window', width: 1000, height: 600, printer: 'EPSON', token: 'secret' })
    expect(Object.keys(parsed).sort()).toEqual(['height', 'mode', 'width'])
  })

  test('the default is not shared: changing a result never changes DEFAULT_WINDOW_STATE', () => {
    const parsed = parseWindowState(null) as { width: number }
    parsed.width = 999
    expect(DEFAULT_WINDOW_STATE.width).toBe(1280)
  })
})

describe('nextModeAfterToggle', () => {
  test('kiosk becomes window and window becomes kiosk', () => {
    expect(nextModeAfterToggle('kiosk')).toBe('window')
    expect(nextModeAfterToggle('window')).toBe('kiosk')
  })
})
