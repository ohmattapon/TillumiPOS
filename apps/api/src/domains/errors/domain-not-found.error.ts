import { DomainError, type ErrorParams } from './domain-error'

export class DomainNotFoundError extends DomainError {
  constructor(message: string, code = 'NOT_FOUND', params?: ErrorParams) {
    super(message, code, params)
  }
}
