import { DomainError } from './domain-error'

export class DomainForbiddenError extends DomainError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, code)
  }
}
