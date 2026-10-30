import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions, PrinterInfo } from 'electron'
import { choosePrinter } from './printers'
import { strings } from './strings'

export interface OwnerMenuInput {
  window: BrowserWindow
  printers: PrinterInfo[]
  savedPrinter: string | null
  onChoosePrinter: (name: string) => void
  onReload: () => void
  onQuit: () => void
}

function printerItems({ printers, savedPrinter, onChoosePrinter }: OwnerMenuInput): MenuItemConstructorOptions[] {
  if (printers.length === 0) return [{ label: strings.printerSettings.none, enabled: false }]
  const chosen = choosePrinter(savedPrinter, printers)
  return printers.map((printer) => ({
    type: 'radio',
    label: printer.isDefault ? `${printer.name} ${strings.printerSettings.defaultMark}` : printer.name,
    checked: printer.name === chosen,
    click: () => onChoosePrinter(printer.name),
  }))
}

/** Pops up the owner menu: the only way out of full screen or out of the app. */
export function popupOwnerMenu(input: OwnerMenuInput): void {
  const { window } = input
  const fullScreen = window.isFullScreen() || window.isKiosk()
  Menu.buildFromTemplate([
    {
      label: fullScreen ? strings.menu.exitFullScreen : strings.menu.enterFullScreen,
      click: () => {
        window.setKiosk(!fullScreen)
        window.setFullScreen(!fullScreen)
      },
    },
    { label: strings.menu.printerSettings, submenu: printerItems(input) },
    { label: strings.menu.reload, click: input.onReload },
    { type: 'separator' },
    { label: strings.menu.quit, click: input.onQuit },
  ]).popup({ window })
}
