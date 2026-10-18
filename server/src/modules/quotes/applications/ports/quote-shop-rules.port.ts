import type { ShopSettingsEntity } from '../../../../domains/shop-settings.domain'

/** The shop rules a quote pins: the time zone promotions are read in, and the VAT. Owned here, answered by the settings module. */
export interface IQuoteShopRules {
  get(): Promise<Pick<ShopSettingsEntity, 'timeZone' | 'vatMode' | 'vatRateBp'>>
}

const quoteShopRulesTokenSymbol: unique symbol = Symbol('IQuoteShopRules')
export const quoteShopRulesToken = quoteShopRulesTokenSymbol.toString()
