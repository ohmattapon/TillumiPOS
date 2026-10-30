/** The part of Electron's keyboard `Input` that the shortcut reads. */
export interface KeyInput {
  type: string
  code: string
  control: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  isAutoRepeat: boolean
}

/**
 * Ctrl+Shift+Alt+O opens the owner menu. Four keys at once so nobody hits it by accident.
 * Holding the keys down repeats the key press, which is ignored so the menu opens once.
 * It reads the physical key (`code`), because the typed character is Thai on a Thai layout.
 */
export function isOwnerShortcut(input: KeyInput): boolean {
  return (
    input.type === 'keyDown' &&
    !input.isAutoRepeat &&
    input.control &&
    input.shift &&
    input.alt &&
    !input.meta &&
    input.code === 'KeyO'
  )
}
