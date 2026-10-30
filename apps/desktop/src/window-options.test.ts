import { describe, expect, test } from 'bun:test'
import { visiblePosition, windowOptionsFor } from './window-options'

const screen1 = { x: 0, y: 0, width: 1920, height: 1040 }
const screen2 = { x: 1920, y: 0, width: 1280, height: 720 }
const windowed = { mode: 'window', width: 1000, height: 600, x: 100, y: 80 } as const

describe('windowOptionsFor', () => {
  test('kiosk is full screen and kiosk, as the shop has always started', () => {
    expect(windowOptionsFor({ mode: 'kiosk', width: 1000, height: 600, x: 100, y: 80 }, [screen1])).toEqual({
      fullscreen: true,
      kiosk: true,
      resizable: true,
      minimizable: true,
      frame: true,
      minWidth: 640,
      minHeight: 480,
    })
  })

  test('window mode is a normal framed window of the saved size and place', () => {
    expect(windowOptionsFor(windowed, [screen1])).toEqual({
      fullscreen: false,
      kiosk: false,
      resizable: true,
      minimizable: true,
      frame: true,
      minWidth: 640,
      minHeight: 480,
      width: 1000,
      height: 600,
      x: 100,
      y: 80,
    })
  })

  test('window mode with no saved position leaves the place to the system', () => {
    const options = windowOptionsFor({ mode: 'window', width: 1280, height: 720 }, [screen1])
    expect(options).toMatchObject({ width: 1280, height: 720 })
    expect('x' in options).toBe(false)
    expect('y' in options).toBe(false)
  })

  test('a saved position on a screen that is gone is not used', () => {
    const options = windowOptionsFor({ ...windowed, x: 2500, y: 100 }, [screen1])
    expect(options).toMatchObject({ width: 1000, height: 600 })
    expect('x' in options).toBe(false)
    expect('y' in options).toBe(false)
  })
})

describe('visiblePosition', () => {
  test('a position whose title bar is on a screen is kept', () => {
    expect(visiblePosition(windowed, [screen1])).toEqual({ x: 100, y: 80 })
  })

  test('a position on the second screen is kept while that screen exists', () => {
    const onSecond = { ...windowed, x: 2000, y: 50 }
    expect(visiblePosition(onSecond, [screen1, screen2])).toEqual({ x: 2000, y: 50 })
    expect(visiblePosition(onSecond, [screen1])).toBeUndefined()
  })

  test('a window whose title bar is above or below the screen is dropped', () => {
    expect(visiblePosition({ ...windowed, y: -300 }, [screen1])).toBeUndefined()
    expect(visiblePosition({ ...windowed, y: 1100 }, [screen1])).toBeUndefined()
  })

  test('a window pushed so far left that only its right end shows is dropped', () => {
    expect(visiblePosition({ ...windowed, x: -950 }, [screen1])).toBeUndefined()
  })

  test('no position, or no screens at all, gives none', () => {
    expect(visiblePosition({ mode: 'window', width: 1000, height: 600 }, [screen1])).toBeUndefined()
    expect(visiblePosition(windowed, [])).toBeUndefined()
  })
})
