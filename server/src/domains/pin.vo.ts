import { DomainError } from './errors/domain-error'

export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6

// ASCII digits only: \d would also match other scripts' digits in some engines.
const PIN_PATTERN = new RegExp(`^[0-9]{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`)

/** The one PIN rule, shared with the web (`@pos/api/pin`) so the pad never accepts what the server refuses. */
export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin)

export function assertValidPin(pin: string): void {
  if (!isValidPin(pin)) throw new DomainError('PIN ต้องเป็นตัวเลข 4 ถึง 6 หลัก', 'INVALID_PIN')
}
