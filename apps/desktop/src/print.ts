import { BrowserWindow } from 'electron'
import type { PrinterInfo } from 'electron'
import type { PrintResult } from './channels'
import { choosePrinter } from './printers'

const PRINT_TIMEOUT_MS = 30_000

/**
 * Prints receipt HTML without a dialog on the chosen printer. The HTML is rendered in a hidden,
 * sandboxed window with scripts off and navigation blocked, so a receipt can only draw. It never
 * throws: every failure is a `{ ok: false, reason }` the web can fall back from.
 */
export async function printReceiptSilently(
  html: string,
  savedPrinter: string | null,
  available: PrinterInfo[],
): Promise<PrintResult> {
  const deviceName = choosePrinter(savedPrinter, available)
  if (deviceName === null) return { ok: false, reason: 'no-printer' }

  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false },
  })
  window.webContents.on('will-navigate', (details) => details.preventDefault())
  window.webContents.on('will-redirect', (details) => details.preventDefault())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  try {
    // loadURL settles when the page has loaded, or rejects when it fails to.
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await new Promise<PrintResult>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), PRINT_TIMEOUT_MS)
      window.webContents.print({ silent: true, deviceName, printBackground: true }, (success, failureReason) => {
        clearTimeout(timer)
        resolve(success ? { ok: true } : { ok: false, reason: failureReason || 'print-failed' })
      })
    })
  } catch {
    return { ok: false, reason: 'print-failed' }
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
