import { DomainError, type ErrorParams } from './domain-error'

export class DomainExternalServiceError extends DomainError {
  constructor(message: string, code = 'EXTERNAL_SERVICE', params?: ErrorParams) {
    super(message, code, params)
  }
}
