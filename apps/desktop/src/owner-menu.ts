import { Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import { strings } from './strings'

export interface OwnerMenuInput {
  window: BrowserWindow
  onReload: () => void
  onQuit: () => void
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
    { label: strings.menu.reload, click: input.onReload },
    { type: 'separator' },
    { label: strings.menu.quit, click: input.onQuit },
  ]).popup({ window })
}
