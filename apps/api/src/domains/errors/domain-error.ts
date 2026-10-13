/** Values a client needs to rebuild the message in its own language. */
export type ErrorParams = Record<string, string | number>

/**
 * A business rule was broken. `code` is the stable identifier clients switch on;
 * `params` carry the data that was interpolated into `message`, so it can be rebuilt in another language.
 */
export class DomainError extends Error {
  readonly code: string
  readonly params?: ErrorParams

  constructor(message: string, code = 'BAD_REQUEST', params?: ErrorParams) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.params = params
  }
}
