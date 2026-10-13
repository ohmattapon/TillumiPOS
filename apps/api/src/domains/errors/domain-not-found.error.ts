import { DomainError } from './domain-error'

export class DomainNotFoundError extends DomainError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, code)
  }
}
