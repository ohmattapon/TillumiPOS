import { isValidPin, PIN_MAX_LENGTH } from '@pos/api/pin'

export { PIN_MAX_LENGTH }

/** Adds one digit; anything that is not a single digit, or a PIN already at the maximum, changes nothing. */
export function appendDigit(pin: string, digit: string): string {
  if (!/^\d$/.test(digit) || pin.length >= PIN_MAX_LENGTH) return pin
  return pin + digit
}

export const removeDigit = (pin: string): string => pin.slice(0, -1)

/** The server's own PIN rule, so the pad never submits what the server would refuse. */
export const canSubmitPin = isValidPin

export type PinKeyAction = 'digit' | 'backspace' | 'submit' | 'swallow' | 'ignore'

/**
 * What a key press means for the PIN pad. Enter on a focused button belongs to that button when it is outside
 * the pad (Cancel, use password) or is the pad's own submit; on a pad digit it submits, and when it cannot
 * submit it is swallowed so the browser does not click the digit a second time.
 */
export function pinKeyAction(input: {
  key: string
  pin: string
  targetIsInsidePad: boolean
  targetIsButtonOrLink: boolean
  targetIsSubmit: boolean
}): PinKeyAction {
  if (/^\d$/.test(input.key)) return 'digit'
  if (input.key === 'Backspace') return 'backspace'
  if (input.key !== 'Enter') return 'ignore'
  if (input.targetIsSubmit) return 'ignore'
  if (input.targetIsButtonOrLink && !input.targetIsInsidePad) return 'ignore'
  if (canSubmitPin(input.pin)) return 'submit'
  return input.targetIsInsidePad && input.targetIsButtonOrLink ? 'swallow' : 'ignore'
}
