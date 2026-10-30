import { app, BrowserWindow, screen, shell } from 'electron'
import type { Event, WebContents, WebPreferences } from 'electron'
import { createDebouncedRunner } from './debounce'
import { isOwnerShortcut } from './owner-shortcut'
import { navigationDecision } from './shop-origin'
import { strings } from './strings'
import { windowOpenDecision } from './window-open'
import { currentWindowMode, rememberWindowState, switchWindowMode } from './window-mode-switch'
import { windowOptionsFor } from './window-options'
import { loadWindowState } from './window-state-file'
import { isWindowToggleKey } from './window-toggle-key'

export interface ShopWindowInput {
  shopOrigin: string
  /** Absolute path of the bundled preload script. */
  preloadPath: string
  onOwnerShortcut: () => void
  /** Folder for window-state.json (the caller passes app.getPath('userData')). */
  userDataDir: string
}

// A drag or resize fires many events; one write follows the last of them.
const SAVE_DELAY_MS = 500

/**
 * One policy for every window of the app, the shop window and the popups it opens: navigations
 * and redirects are checked against the shop origin, and a new window is allowed only when it
 * has that origin too (the customer display). A popup gets the same secure web preferences and
 * is never full screen or kiosk, and it is guarded in turn, so a popup cannot open a wider one.
 */
function applyWindowPolicy(contents: WebContents, shopOrigin: string, webPreferences: WebPreferences): void {
  // Server redirects do not fire will-navigate, so both events get the same rule.
  const guard = (details: Event<{ url: string }>): void => {
    const decision = navigationDecision(shopOrigin, details.url)
    if (decision === 'allow') return
    details.preventDefault()
    if (decision === 'external') void shell.openExternal(details.url)
  }
  contents.on('will-navigate', guard)
  contents.on('will-redirect', guard)
  contents.setWindowOpenHandler(({ url }) => {
    const decision = windowOpenDecision(shopOrigin, url)
    if (decision === 'external') void shell.openExternal(url)
    if (decision !== 'allow-popup') return { action: 'deny' }
    return { action: 'allow', overrideBrowserWindowOptions: { webPreferences, fullscreen: false, kiosk: false } }
  })
  contents.on('did-create-window', (popup) => applyWindowPolicy(popup.webContents, shopOrigin, webPreferences))
}

/**
 * The one window of the app: full screen (kiosk) or a normal framed window, as the owner last
 * chose (window-state.json; kiosk on first run). It carries no menu and cannot be closed except by
 * quitting from the owner menu (or by Windows shutting down). Anything that is not the shop
 * is sent to the system browser or dropped, never loaded here.
 */
export function createShopWindow({ shopOrigin, preloadPath, onOwnerShortcut, userDataDir }: ShopWindowInput): BrowserWindow {
  const webPreferences: WebPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: false,
    preload: preloadPath,
  }
  const state = loadWindowState(userDataDir)
  const window = new BrowserWindow({
    title: strings.appName,
    show: true,
    ...windowOptionsFor(
      state,
      screen.getAllDisplays().map((display) => display.workArea),
    ),
    autoHideMenuBar: true,
    backgroundColor: '#f6f5f2',
    webPreferences,
  })
  window.removeMenu()

  applyWindowPolicy(window.webContents, shopOrigin, webPreferences)

  window.webContents.on('before-input-event', (event, input) => {
    if (isOwnerShortcut(input)) {
      event.preventDefault()
      onOwnerShortcut()
      return
    }
    if (!isWindowToggleKey(input)) return
    event.preventDefault()
    switchWindowMode(window, userDataDir, currentWindowMode(window))
  })

  // Only the windowed bounds are remembered: while the window covers the screen there is nothing to save.
  // getNormalBounds gives the restored size even if the owner maximized the window.
  const saveBounds = createDebouncedRunner(() => {
    if (window.isDestroyed() || window.isFullScreen() || window.isKiosk() || window.isMinimized()) return
    const { x, y, width, height } = window.getNormalBounds()
    rememberWindowState(userDataDir, { mode: 'window', width, height, x, y })
  }, SAVE_DELAY_MS)
  window.on('resize', saveBounds.schedule)
  window.on('move', saveBounds.schedule)

  let quitting = false
  app.on('before-quit', () => {
    quitting = true
  })
  // Windows shutdown or sign-out must not be blocked by the close guard below.
  window.on('session-end', () => {
    quitting = true
  })
  window.on('close', (event) => {
    // A move in the last half second must not be lost when the app quits.
    saveBounds.flush()
    if (!quitting) event.preventDefault()
  })

  return window
}
