export type WindowMode = 'kiosk' | 'window'

/** What the app remembers about its window between runs. Nothing else is ever stored. */
export interface WindowState {
  mode: WindowMode
  /** Size of the normal (windowed) window. Kept while in kiosk so leaving full screen has a size. */
  width: number
  height: number
  x?: number
  y?: number
}

/** The shop starts full screen on first run, as before; 1280x720 is the size when it is first windowed. */
export const DEFAULT_WINDOW_STATE: Readonly<WindowState> = Object.freeze({ mode: 'kiosk', width: 1280, height: 720 })

export const MIN_WINDOW_WIDTH = 640
export const MIN_WINDOW_HEIGHT = 480
const WIDTH_RANGE = { min: MIN_WINDOW_WIDTH, max: 7680 }
const HEIGHT_RANGE = { min: MIN_WINDOW_HEIGHT, max: 4320 }
const POSITION_RANGE = { min: -10_000, max: 10_000 }

function isIntegerWithin(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
}

/**
 * Reads a saved state that came from disk, so it is treated like input from outside: each part
 * that is not usable falls back on its own (mode to kiosk, size to 1280x720 as a pair, position
 * dropped as a pair) and unknown fields are never carried over. A bad file never blocks startup.
 */
export function parseWindowState(raw: unknown): WindowState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_WINDOW_STATE }
  const candidate = raw as Record<string, unknown>

  const mode: WindowMode = candidate.mode === 'window' || candidate.mode === 'kiosk' ? candidate.mode : DEFAULT_WINDOW_STATE.mode
  const sizeUsable = isIntegerWithin(candidate.width, WIDTH_RANGE) && isIntegerWithin(candidate.height, HEIGHT_RANGE)
  const state: WindowState = {
    mode,
    width: sizeUsable ? (candidate.width as number) : DEFAULT_WINDOW_STATE.width,
    height: sizeUsable ? (candidate.height as number) : DEFAULT_WINDOW_STATE.height,
  }
  if (isIntegerWithin(candidate.x, POSITION_RANGE) && isIntegerWithin(candidate.y, POSITION_RANGE)) {
    state.x = candidate.x
    state.y = candidate.y
  }
  return state
}

export function nextModeAfterToggle(current: WindowMode): WindowMode {
  return current === 'kiosk' ? 'window' : 'kiosk'
}
