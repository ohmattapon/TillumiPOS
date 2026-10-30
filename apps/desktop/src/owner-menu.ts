import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { menuItemsFor } from './owner-menu-items'
import type { OwnerMenuItemId } from './owner-menu-items'
import { strings } from './strings'
import { currentWindowMode, switchWindowMode } from './window-mode-switch'

export interface OwnerMenuInput {
  window: BrowserWindow
  /** Folder for window-state.json (app.getPath('userData')). */
  userDataDir: string
  onReload: () => void
  onQuit: () => void
}

/** Pops up the owner menu: the way out of full screen (or back into it), and out of the app. */
export function popupOwnerMenu(input: OwnerMenuInput): void {
  const { window, userDataDir } = input
  const mode = currentWindowMode(window)
  const template: Record<OwnerMenuItemId, MenuItemConstructorOptions> = {
    toggleFullScreen: {
      label: mode === 'kiosk' ? strings.menu.exitFullScreen : strings.menu.enterFullScreen,
      click: () => switchWindowMode(window, userDataDir, mode),
    },
    minimize: { label: strings.menu.minimize, click: () => window.minimize() },
    reload: { label: strings.menu.reload, click: input.onReload },
    separator: { type: 'separator' },
    quit: { label: strings.menu.quit, click: input.onQuit },
  }
  Menu.buildFromTemplate(menuItemsFor(mode).map((id) => template[id])).popup({ window })
}
