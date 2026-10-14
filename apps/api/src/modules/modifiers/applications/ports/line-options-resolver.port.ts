import type { ResolvedLineOptions } from '../../../../domains/modifier.domain'

/**
 * Checks what was chosen on a product against the groups it offers, and prices it. The one way an
 * order or a sale learns what a choice of options costs, so the rules live in one place.
 */
export interface ILineOptionsResolver {
  /** Throws DomainError (MODIFIER_REQUIRED, MODIFIER_TOO_MANY, MODIFIER_DUPLICATE, MODIFIER_NOT_AVAILABLE). */
  resolve(productId: number, optionIds: readonly number[]): Promise<ResolvedLineOptions>
}

const lineOptionsResolverTokenSymbol: unique symbol = Symbol('ILineOptionsResolver')
export const lineOptionsResolverToken = lineOptionsResolverTokenSymbol.toString()
