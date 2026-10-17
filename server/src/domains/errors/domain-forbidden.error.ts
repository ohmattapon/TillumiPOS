import { DomainError, type ErrorParams } from './domain-error'

export class DomainForbiddenError extends DomainError {
  constructor(message: string, code = 'FORBIDDEN', params?: ErrorParams) {
    super(message, code, params)
  }
}
