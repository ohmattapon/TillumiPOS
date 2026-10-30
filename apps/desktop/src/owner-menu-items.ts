import type { WindowMode } from './window-mode'

export type OwnerMenuItemId = 'toggleFullScreen' | 'minimize' | 'reload' | 'separator' | 'quit'

/** Which items the owner menu shows, in order. Minimize is for the windowed app only: over a kiosk there is no taskbar to bring it back from. */
export function menuItemsFor(mode: WindowMode): OwnerMenuItemId[] {
  return [
    'toggleFullScreen',
    ...(mode === 'window' ? (['minimize'] as const) : []),
    'reload',
    'separator',
    'quit',
  ]
}
