import type { KeyInput } from './owner-shortcut'

/**
 * F11 or Alt+Enter switches between full screen and a window, the way a browser does, so the
 * owner can leave full screen without the menu. One key press per press: holding the key down
 * repeats it, and that is ignored. A key with any other modifier on it belongs to the page.
 */
export function isWindowToggleKey(input: KeyInput): boolean {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false
  const noModifier = !input.control && !input.shift && !input.alt && !input.meta
  if (input.code === 'F11') return noModifier
  return input.code === 'Enter' && input.alt && !input.control && !input.shift && !input.meta
}
