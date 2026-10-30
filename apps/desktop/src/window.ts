import { app, BrowserWindow, shell } from 'electron'
import type { NavigationEvent, WebContents, WebPreferences } from 'electron'
import { isOwnerShortcut } from './owner-shortcut'
import { navigationDecision } from './shop-origin'
import { strings } from './strings'
import { windowOpenDecision } from './window-open'

export interface ShopWindowInput {
  shopOrigin: string
  /** Absolute path of the bundled preload script. */
  preloadPath: string
  onOwnerShortcut: () => void
}

/**
 * One policy for every window of the app, the shop window and the popups it opens: navigations
 * and redirects are checked against the shop origin, and a new window is allowed only when it
 * has that origin too (the customer display). A popup gets the same secure web preferences and
 * is never full screen or kiosk, and it is guarded in turn, so a popup cannot open a wider one.
 */
function applyWindowPolicy(contents: WebContents, shopOrigin: string, webPreferences: WebPreferences): void {
  // Server redirects do not fire will-navigate, so both events get the same rule.
  const guard = (details: NavigationEvent): void => {
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
 * The one full-screen window of the app. It carries no menu and cannot be closed except by
 * quitting from the owner menu (or by Windows shutting down). Anything that is not the shop
 * is sent to the system browser or dropped, never loaded here.
 */
export function createShopWindow({ shopOrigin, preloadPath, onOwnerShortcut }: ShopWindowInput): BrowserWindow {
  const webPreferences: WebPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: false,
    preload: preloadPath,
  }
  const window = new BrowserWindow({
    title: strings.appName,
    show: true,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#f6f5f2',
    webPreferences,
  })
  window.removeMenu()

  applyWindowPolicy(window.webContents, shopOrigin, webPreferences)

  window.webContents.on('before-input-event', (event, input) => {
    if (!isOwnerShortcut(input)) return
    event.preventDefault()
    onOwnerShortcut()
  })

  let quitting = false
  app.on('before-quit', () => {
    quitting = true
  })
  // Windows shutdown or sign-out must not be blocked by the close guard below.
  window.on('session-end', () => {
    quitting = true
  })
  window.on('close', (event) => {
    if (!quitting) event.preventDefault()
  })

  return window
}
