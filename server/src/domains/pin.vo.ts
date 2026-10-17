import { DomainError } from './errors/domain-error'

// ASCII digits only: \d would also match other scripts' digits in some engines.
const PIN_PATTERN = /^[0-9]{4,6}$/

export function assertValidPin(pin: string): void {
  if (!PIN_PATTERN.test(pin)) throw new DomainError('PIN ต้องเป็นตัวเลข 4 ถึง 6 หลัก', 'INVALID_PIN')
}
