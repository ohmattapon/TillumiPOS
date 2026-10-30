// IPC channel names, shared by the preload and the main process. The preload runs sandboxed and
// cannot load local files at run time, so the build must bundle it into one file.
export const channels = {
  printReceipt: 'tillumi:print-receipt',
  listPrinters: 'tillumi:list-printers',
} as const

/** What the preload exposes to the shop page as `window.tillumiDesktop`. */
export interface TillumiDesktop {
  printReceipt(html: string): Promise<PrintResult>
  listPrinters(): Promise<{ name: string; isDefault: boolean }[]>
}

export interface PrintResult {
  ok: boolean
  reason?: string
}
