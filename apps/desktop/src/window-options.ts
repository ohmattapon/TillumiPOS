import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from './window-mode'
import type { WindowState } from './window-mode'

export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

/** The part of the BrowserWindow options that depends on the saved mode. */
export interface WindowGeometry {
  fullscreen: boolean
  kiosk: boolean
  resizable: boolean
  minimizable: boolean
  frame: boolean
  minWidth: number
  minHeight: number
  width?: number
  height?: number
  x?: number
  y?: number
}

// A point in the title bar, near its left end. If it is on a screen the owner can still grab the window.
const GRAB_OFFSET = { x: 100, y: 15 }

/**
 * The saved position, but only if the window could still be dragged from it: the saved place may
 * belong to a second screen that is no longer plugged in. Otherwise `undefined`, so the system
 * places the window.
 */
export function visiblePosition(state: WindowState, workAreas: readonly Rectangle[]): { x: number; y: number } | undefined {
  if (state.x === undefined || state.y === undefined) return undefined
  const grabX = state.x + GRAB_OFFSET.x
  const grabY = state.y + GRAB_OFFSET.y
  const onAScreen = workAreas.some(
    (area) => grabX >= area.x && grabX < area.x + area.width && grabY >= area.y && grabY < area.y + area.height,
  )
  return onAScreen ? { x: state.x, y: state.y } : undefined
}

/**
 * Kiosk is full screen as the shop has always started. Window is an ordinary framed window of the
 * saved size. `frame` is a creation-time option, so both modes use the same framed window and
 * kiosk simply covers the title bar; that is what lets the owner switch at run time.
 */
export function windowOptionsFor(state: WindowState, workAreas: readonly Rectangle[]): WindowGeometry {
  const common = { resizable: true, minimizable: true, frame: true, minWidth: MIN_WINDOW_WIDTH, minHeight: MIN_WINDOW_HEIGHT }
  if (state.mode === 'kiosk') return { fullscreen: true, kiosk: true, ...common }
  return { fullscreen: false, kiosk: false, ...common, width: state.width, height: state.height, ...visiblePosition(state, workAreas) }
}
