import { describe, expect, test } from 'bun:test'
import { menuItemsFor } from './owner-menu-items'

describe('menuItemsFor', () => {
  test('in window mode the menu can minimize, between the mode switch and reload', () => {
    expect(menuItemsFor('window')).toEqual(['toggleFullScreen', 'minimize', 'reload', 'separator', 'quit'])
  })

  test('in kiosk mode there is no minimize item', () => {
    expect(menuItemsFor('kiosk')).toEqual(['toggleFullScreen', 'reload', 'separator', 'quit'])
  })

  test('both modes keep the way out of the app and the way to switch mode', () => {
    for (const mode of ['kiosk', 'window'] as const) {
      expect(menuItemsFor(mode)).toContain('quit')
      expect(menuItemsFor(mode)).toContain('toggleFullScreen')
    }
  })
})
