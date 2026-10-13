/** A business rule was broken. `code` is the stable identifier clients switch on. */
export class DomainError extends Error {
  readonly code: string

  constructor(message: string, code = 'BAD_REQUEST') {
    super(message)
    this.name = this.constructor.name
    this.code = code
  }
}
