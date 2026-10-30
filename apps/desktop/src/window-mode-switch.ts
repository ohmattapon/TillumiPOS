import { screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { nextModeAfterToggle } from './window-mode'
import type { WindowMode, WindowState } from './window-mode'
import { visiblePosition } from './window-options'
import { loadWindowState, saveWindowState } from './window-state-file'

/** Saves the window state; a failed write is logged and never stops the shop. */
export function rememberWindowState(userDataDir: string, state: WindowState): void {
  try {
    saveWindowState(userDataDir, state)
  } catch (error) {
    console.error(error)
  }
}

/** The mode the window is in now: either flag means it covers the screen. */
export function currentWindowMode(window: BrowserWindow): WindowMode {
  return window.isKiosk() || window.isFullScreen() ? 'kiosk' : 'window'
}

// Puts the window at its remembered windowed size, and place if that place is still on a screen.
function placeWindowed(window: BrowserWindow, saved: WindowState): void {
  const position = visiblePosition(
    saved,
    screen.getAllDisplays().map((display) => display.workArea),
  )
  if (position) {
    window.setBounds({ ...position, width: saved.width, height: saved.height })
  } else {
    window.setSize(saved.width, saved.height)
    window.center()
  }
}

/**
 * Switches between kiosk and a normal window, and remembers the choice for the next start.
 * The owner menu and the F11 / Alt+Enter shortcut both come here, so the two ways agree.
 */
export function switchWindowMode(window: BrowserWindow, userDataDir: string, current: WindowMode): void {
  const next = nextModeAfterToggle(current)
  if (next === 'kiosk') {
    // Keep the place the window had, so leaving full screen later returns to it.
    const { x, y, width, height } = window.getNormalBounds()
    rememberWindowState(userDataDir, { mode: 'kiosk', width, height, x, y })
    window.setKiosk(true)
    window.setFullScreen(true)
    return
  }
  const saved = loadWindowState(userDataDir)
  rememberWindowState(userDataDir, { ...saved, mode: 'window' })
  // The size is set before leaving full screen so the window comes back at the remembered size, and once more
  // after, because Windows may restore the bounds it had before full screen when the mode ends.
  placeWindowed(window, saved)
  window.setKiosk(false)
  window.setFullScreen(false)
  placeWindowed(window, saved)
}
