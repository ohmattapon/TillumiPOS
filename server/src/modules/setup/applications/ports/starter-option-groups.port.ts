import type { ShopType } from '../../../../domains/shop-settings.domain'

/**
 * What a new shop is given to choose from before it has added anything of its own, such as the
 * sweetness and topping groups of a cafe. The shop's kind decides what, so that rule lives with the
 * catalogue and not in the setup.
 */
export interface IStarterOptionGroups {
  /** Adds the groups a shop of this kind starts with; kinds that start with none add nothing. */
  addFor(shopType: ShopType): Promise<void>
}

const starterOptionGroupsTokenSymbol: unique symbol = Symbol('IStarterOptionGroups')
export const starterOptionGroupsToken = starterOptionGroupsTokenSymbol.toString()
