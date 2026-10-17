export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6

/** Adds one digit; anything that is not a single digit, or a PIN already at the maximum, changes nothing. */
export function appendDigit(pin: string, digit: string): string {
  if (!/^\d$/.test(digit) || pin.length >= PIN_MAX_LENGTH) return pin
  return pin + digit
}

export const removeDigit = (pin: string): string => pin.slice(0, -1)

export const canSubmitPin = (pin: string): boolean => /^\d+$/.test(pin) && pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH
