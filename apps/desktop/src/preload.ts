import { contextBridge, ipcRenderer } from 'electron'
import { channels } from './channels'
import type { TillumiDesktop } from './channels'

// The whole surface the shop page gets. The main process checks who is calling on every call
// (see register-ipc in main.ts), because a check made here could be skipped by the page.
const api: TillumiDesktop = {
  printReceipt: (html) => ipcRenderer.invoke(channels.printReceipt, html) as ReturnType<TillumiDesktop['printReceipt']>,
  listPrinters: () => ipcRenderer.invoke(channels.listPrinters) as ReturnType<TillumiDesktop['listPrinters']>,
}

contextBridge.exposeInMainWorld('tillumiDesktop', api)
