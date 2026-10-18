import type { ResolvedLineOptions } from '../../../../domains/modifier.domain'

/** Checks and prices the options chosen on a line. Owned here, answered by the modifiers module with its one set of rules. */
export interface IQuoteLineOptions {
  /** Throws DomainError (MODIFIER_REQUIRED, MODIFIER_TOO_MANY, MODIFIER_DUPLICATE, MODIFIER_NOT_AVAILABLE). */
  resolve(productId: number, optionIds: readonly number[]): Promise<ResolvedLineOptions>
}

const quoteLineOptionsTokenSymbol: unique symbol = Symbol('IQuoteLineOptions')
export const quoteLineOptionsToken = quoteLineOptionsTokenSymbol.toString()
