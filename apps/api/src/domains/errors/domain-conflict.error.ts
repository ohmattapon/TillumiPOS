import { DomainError } from './domain-error'

export class DomainConflictError extends DomainError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code)
  }
}
