import { DomainError } from './domain-error'

export class DomainExternalServiceError extends DomainError {
  constructor(message: string, code = 'EXTERNAL_SERVICE') {
    super(message, code)
  }
}
