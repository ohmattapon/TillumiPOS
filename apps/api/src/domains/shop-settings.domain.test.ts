import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity, type ShopSettingsProps } from './shop-settings.domain'

const settings = (overrides: Partial<ShopSettingsProps> = {}) =>
  new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, ...overrides })

describe('ShopSettingsEntity', () => {
  test('the defaults are valid and describe a Thai shop with VAT-inclusive prices', () => {
    expect(settings().toSnapshot()).toEqual({
      shopName: 'EasyPOS',
      taxId: null,
      address: null,
      phone: null,
      currency: 'THB',
      vatMode: 'inclusive',
      vatRateBp: 700,
      timeZone: 'Asia/Bangkok',
      locale: 'th',
      receiptPaperMm: 80,
      receiptFooter: null,
    })
  })

  test.each<[string, Partial<ShopSettingsProps>]>([
    ['an empty shop name', { shopName: '' }],
    ['a shop name over 100 characters', { shopName: 'x'.repeat(101) }],
    ['a tax id over 20 characters', { taxId: '1'.repeat(21) }],
    ['an address over 300 characters', { address: 'x'.repeat(301) }],
    ['a phone number over 30 characters', { phone: '0'.repeat(31) }],
    ['a lower-case currency code', { currency: 'thb' }],
    ['a currency code of the wrong length', { currency: 'BAHT' }],
    ['an unknown VAT mode', { vatMode: 'maybe' as never }],
    ['a negative VAT rate', { vatRateBp: -1 }],
    ['a VAT rate above 100%', { vatRateBp: 10_001 }],
    ['a fractional VAT rate', { vatRateBp: 7.5 }],
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }],
    ['an unsupported language', { locale: 'fr' as never }],
    ['a paper width no printer uses', { receiptPaperMm: 72 as never }],
    ['a receipt footer over 200 characters', { receiptFooter: 'x'.repeat(201) }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => settings(overrides)).toThrow(DomainError)
  })

  test.each([
    { shopName: 'x'.repeat(100) },
    { taxId: '1'.repeat(20) },
    { vatRateBp: 0 },
    { vatRateBp: 10_000 },
    { timeZone: 'UTC' },
    { currency: 'USD', locale: 'en' as const },
    { receiptPaperMm: 58 as const },
    { receiptFooter: 'x'.repeat(200) },
  ])('accepts the edge value %p', (overrides) => {
    expect(() => settings(overrides)).not.toThrow()
  })

  describe('with', () => {
    test('changes the given fields and keeps the rest', () => {
      const changed = settings().with({ shopName: 'ร้านของฉัน', vatMode: 'exclusive' })

      expect(changed.toSnapshot()).toEqual({ ...DEFAULT_SHOP_SETTINGS, shopName: 'ร้านของฉัน', vatMode: 'exclusive' })
    })

    test('undefined keeps a value, null clears an optional field', () => {
      const changed = settings({ taxId: '0105500000000', phone: '02-000-0000' }).with({ shopName: undefined, taxId: null })

      expect(changed.taxId).toBeNull()
      expect(changed.phone).toBe('02-000-0000')
      expect(changed.shopName).toBe('EasyPOS')
    })

    test('enforces the same rules as the constructor', () => {
      expect(() => settings().with({ currency: 'x' })).toThrow(DomainError)
    })
  })

  test('effectiveVatRateBp is the rate, except zero when VAT is not charged', () => {
    expect(settings({ vatRateBp: 700 }).effectiveVatRateBp).toBe(700)
    expect(settings({ vatMode: 'exclusive', vatRateBp: 700 }).effectiveVatRateBp).toBe(700)
    expect(settings({ vatMode: 'none', vatRateBp: 700 }).effectiveVatRateBp).toBe(0)
  })
})
