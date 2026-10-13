import { DomainError, type ErrorParams } from './domain-error'

export class DomainUnauthorizedError extends DomainError {
  constructor(message: string, code = 'UNAUTHORIZED', params?: ErrorParams) {
    super(message, code, params)
  }
}
