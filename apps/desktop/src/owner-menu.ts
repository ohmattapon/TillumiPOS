import { Menu, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { strings } from './strings'
import { nextModeAfterToggle } from './window-mode'
import type { WindowMode, WindowState } from './window-mode'
import { visiblePosition } from './window-options'
import { rememberWindowState } from './window'
import { loadWindowState } from './window-state-file'

export interface OwnerMenuInput {
  window: BrowserWindow
  /** Folder for window-state.json (app.getPath('userData')). */
  userDataDir: string
  onReload: () => void
  onQuit: () => void
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

// Switches between kiosk and a normal window, and remembers the choice for the next start.
function switchMode(window: BrowserWindow, userDataDir: string, current: WindowMode): void {
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

/** Pops up the owner menu: the way out of full screen (or back into it), and out of the app. */
export function popupOwnerMenu(input: OwnerMenuInput): void {
  const { window, userDataDir } = input
  const fullScreen = window.isFullScreen() || window.isKiosk()
  const mode: WindowMode = fullScreen ? 'kiosk' : 'window'
  Menu.buildFromTemplate([
    {
      label: fullScreen ? strings.menu.exitFullScreen : strings.menu.enterFullScreen,
      click: () => switchMode(window, userDataDir, mode),
    },
    // Minimizing makes no sense over a full-screen kiosk: there is no taskbar to bring it back from.
    ...(fullScreen ? [] : [{ label: strings.menu.minimize, click: () => window.minimize() }]),
    { label: strings.menu.reload, click: input.onReload },
    { type: 'separator' },
    { label: strings.menu.quit, click: input.onQuit },
  ]).popup({ window })
}
