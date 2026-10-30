import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { nextDelayMs } from './backoff'
import { channels } from './channels'
import type { PrintResult } from './channels'
import { isShopHealthy } from './health'
import { eventIsTrusted } from './ipc'
import { popupOwnerMenu } from './owner-menu'
import { printReceiptSilently } from './print'
import { loadSettings, saveSettings } from './settings'
import { parseShopOrigin } from './shop-origin'
import { strings } from './strings'
import { createShopWindow } from './window'

// A receipt is a few kilobytes; this only stops a page from sending the app something huge.
const MAX_RECEIPT_CHARS = 500_000
// Chromium reports a navigation replaced by another one as error -3; that is not a failure.
const ERR_ABORTED = -3

const WAIT_PAGE = fileURLToPath(new URL('./wait-page.html', import.meta.url))
// The preload is bundled to a single file next to this one (sandboxed preloads cannot load others).
const PRELOAD = fileURLToPath(new URL('./preload.js', import.meta.url))

// The window that a second launch brings to the front. Set once the window exists.
let activeWindow: BrowserWindow | null = null

// The menu runs from event callbacks nobody awaits, so a failure is logged and shown, never lost.
function reportFailure(error: unknown, message: string = strings.errors.menuFailed): void {
  console.error(error)
  dialog.showErrorBox(strings.appName, message)
}

function start(): void {
  let shopOrigin: string
  try {
    shopOrigin = parseShopOrigin(process.env.TILLUMI_SHOP_URL)
  } catch {
    dialog.showErrorBox(strings.config.invalidShopUrlTitle, strings.config.invalidShopUrlMessage)
    app.quit()
    return
  }
  const settingsDir = app.getPath('userData')

  // Shows the shop when its API is up and the waiting page until then. Only one loop runs at a time.
  let opening = false
  async function openShop(): Promise<void> {
    if (opening) return
    opening = true
    try {
      let attempt = 0
      let waitShown = false
      while (!shopWindow.isDestroyed()) {
        if (await isShopHealthy(shopOrigin)) {
          try {
            await shopWindow.loadURL(shopOrigin)
            return
          } catch {
            // The service went away between the probe and the load: wait and try again.
          }
        }
        if (!waitShown) {
          waitShown = true
          await shopWindow.loadFile(WAIT_PAGE)
        }
        await new Promise((resolve) => setTimeout(resolve, nextDelayMs(attempt++)))
      }
    } finally {
      opening = false
    }
  }

  const shopWindow: BrowserWindow = createShopWindow({
    shopOrigin,
    preloadPath: PRELOAD,
    onOwnerShortcut: () => void showOwnerMenu().catch(reportFailure),
  })

  activeWindow = shopWindow

  async function showOwnerMenu(): Promise<void> {
    const printers = await shopWindow.webContents.getPrintersAsync()
    popupOwnerMenu({
      window: shopWindow,
      printers,
      savedPrinter: loadSettings(settingsDir).printer,
      onChoosePrinter: (printer) => {
        try {
          saveSettings(settingsDir, { printer })
        } catch (error) {
          reportFailure(error, strings.errors.saveFailed)
        }
      },
      onReload: () => void openShop(),
      onQuit: () => app.quit(),
    })
  }

  // The caller is checked in the main process on every call: the page cannot skip a check made here.
  ipcMain.handle(channels.listPrinters, async (event) => {
    if (!eventIsTrusted(shopOrigin, event)) throw new Error('untrusted sender')
    const printers = await shopWindow.webContents.getPrintersAsync()
    return printers.map(({ name, isDefault }) => ({ name, isDefault }))
  })
  ipcMain.handle(channels.printReceipt, async (event, html): Promise<PrintResult> => {
    if (!eventIsTrusted(shopOrigin, event)) return { ok: false, reason: 'untrusted' }
    if (typeof html !== 'string' || html === '' || html.length > MAX_RECEIPT_CHARS) {
      return { ok: false, reason: 'bad-input' }
    }
    const printers = await shopWindow.webContents.getPrintersAsync()
    return printReceiptSilently(html, loadSettings(settingsDir).printer, printers)
  })

  // A page that fails to load (the service stopped, then the shop was reloaded) goes back to waiting.
  shopWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== ERR_ABORTED) void openShop()
  })

  void openShop()

  app.on('window-all-closed', () => app.quit())
}

// A second launch asks the first to focus and exits at once, so there is never a second kiosk.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Registered now, not after the app is ready, so a launch during startup is not missed.
  app.on('second-instance', () => {
    if (!activeWindow || activeWindow.isDestroyed()) return
    if (activeWindow.isMinimized()) activeWindow.restore()
    activeWindow.show()
    activeWindow.focus()
  })
  void app.whenReady().then(start)
}
