import { app, BrowserWindow, shell } from 'electron'
import type { NavigationEvent } from 'electron'
import { isOwnerShortcut } from './owner-shortcut'
import { navigationDecision } from './shop-origin'
import { strings } from './strings'

export interface ShopWindowInput {
  shopOrigin: string
  /** Absolute path of the bundled preload script. */
  preloadPath: string
  onOwnerShortcut: () => void
}

/**
 * The one full-screen window of the app. It carries no menu and cannot be closed except by
 * quitting from the owner menu (or by Windows shutting down). Anything that is not the shop
 * is sent to the system browser or dropped, never loaded here.
 */
export function createShopWindow({ shopOrigin, preloadPath, onOwnerShortcut }: ShopWindowInput): BrowserWindow {
  const window = new BrowserWindow({
    title: strings.appName,
    show: true,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#f6f5f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
      preload: preloadPath,
    },
  })
  window.removeMenu()

  // Server redirects do not fire will-navigate, so both events get the same rule.
  const guard = (details: NavigationEvent): void => {
    const decision = navigationDecision(shopOrigin, details.url)
    if (decision === 'allow') return
    details.preventDefault()
    if (decision === 'external') void shell.openExternal(details.url)
  }
  window.webContents.on('will-navigate', guard)
  window.webContents.on('will-redirect', guard)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (navigationDecision(shopOrigin, url) === 'external') void shell.openExternal(url)
    return { action: 'deny' }
  })

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
