import { DomainError } from './domain-error'

export class DomainUnauthorizedError extends DomainError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    super(message, code)
  }
}
