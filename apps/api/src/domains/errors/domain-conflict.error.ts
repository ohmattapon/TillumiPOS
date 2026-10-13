import { DomainError, type ErrorParams } from './domain-error'

export class DomainConflictError extends DomainError {
  constructor(message: string, code = 'CONFLICT', params?: ErrorParams) {
    super(message, code, params)
  }
}
