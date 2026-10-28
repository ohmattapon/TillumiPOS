import type { ShopSettingsEntity } from '../../../../domains/shop-settings.domain'

/** The shop rules a quote pins: the time zone promotions are read in, the VAT, and the points rule it redeems under. Owned here, answered by the settings module. */
export interface IQuoteShopRules {
  get(): Promise<
    Pick<
      ShopSettingsEntity,
      | 'timeZone'
      | 'vatMode'
      | 'vatRateBp'
      | 'pointsEnabled'
      | 'pointsEarnSatang'
      | 'pointsRedeemSatang'
      | 'pointsMinRedeem'
    >
  >
}

const quoteShopRulesTokenSymbol: unique symbol = Symbol('IQuoteShopRules')
export const quoteShopRulesToken = quoteShopRulesTokenSymbol.toString()
