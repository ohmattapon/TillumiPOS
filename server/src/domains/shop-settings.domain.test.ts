import { describe, expect, test } from 'bun:test'
import { DomainError } from './errors/domain-error'
import {
  buildLogoKey,
  DEFAULT_SHOP_SETTINGS,
  SHOP_TYPES,
  ShopSettingsEntity,
  shopFeaturesFor,
  type ShopSettingsProps,
} from './shop-settings.domain'

const settings = (overrides: Partial<ShopSettingsProps> = {}) =>
  new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, ...overrides })

describe('ShopSettingsEntity', () => {
  test('the defaults are valid and describe a Thai shop with VAT-inclusive prices', () => {
    expect(settings().toSnapshot()).toEqual({
      shopName: 'TillumiPOS',
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
      homeView: 'till',
      tablesEnabled: true,
      modifiersEnabled: true,
      promptpayMode: 'bank',
      promptpayTarget: null,
      receiptPrinterIp: null,
      receiptPrinterPort: 9100,
      receiptPrinterEnabled: false,
      cashDrawerEnabled: false,
      logoKey: null,
      pointsEnabled: false,
      pointsEarnSatang: 2500,
      pointsRedeemSatang: 100,
      pointsMinRedeem: 10,
    })
  })

  test('a logo key has the shape the upload makes, or the shop has no logo', () => {
    expect(settings({ logoKey: 'logo/3f2c9a1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f.webp' }).logoKey).toBe('logo/3f2c9a1e-7b4d-4c1a-9e2f-0a1b2c3d4e5f.webp')
    for (const logoKey of ['logo/../../etc/passwd.png', 'products/1/a.png', 'logo/a.gif', 'logo/.png', '/logo/a.png'])
      expect(() => settings({ logoKey })).toThrow(DomainError)
  })

  test('a built logo key is one the entity accepts', () => {
    expect(settings({ logoKey: buildLogoKey('3f2c9a1e-7b4d', 'webp') }).logoKey).toBe('logo/3f2c9a1e-7b4d.webp')
  })

  test('a shop saved before logos existed has no logo', () => {
    const { logoKey: _logoKey, ...old } = DEFAULT_SHOP_SETTINGS
    expect(new ShopSettingsEntity(old as ShopSettingsProps).logoKey).toBeNull()
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
    ['an unknown home view', { homeView: 'floor' as never }],
    ['a feature switch that is not a boolean', { tablesEnabled: 'yes' as never }],
    ['an unknown PromptPay mode', { promptpayMode: 'qr' as never }],
    ['a non-digit PromptPay target', { promptpayTarget: '081-234-5678' }],
    ['a 9-digit PromptPay target', { promptpayTarget: '081234567' }],
    ['an 11-digit PromptPay target', { promptpayTarget: '08123456789' }],
    ['a 12-digit PromptPay target', { promptpayTarget: '123456789012' }],
    ['a 14-digit PromptPay target', { promptpayTarget: '12345678901234' }],
    ['a 10-digit PromptPay target not starting with 0', { promptpayTarget: '1812345678' }],
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
    { homeView: 'tables' as const },
    { promptpayMode: 'static' as const, promptpayTarget: '0812345678' },
    { promptpayTarget: '1234567890123' },
    { promptpayTarget: null },
  ])('accepts the edge value %p', (overrides) => {
    expect(() => settings(overrides)).not.toThrow()
  })

  describe('home view', () => {
    test('the default is the till', () => {
      expect(DEFAULT_SHOP_SETTINGS.homeView).toBe('till')
    })

    test('the floor plan of tables can be the home view', () => {
      expect(settings({ homeView: 'tables' }).homeView).toBe('tables')
    })

    test('a refused home view is an INVALID_SHOP_SETTINGS domain error', () => {
      expect(() => settings({ homeView: 'floor' as never })).toThrow(
        expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }),
      )
    })
  })

  describe('feature switches', () => {
    test('the floor plan cannot be home while tables are off', () => {
      expect(() => settings({ tablesEnabled: false, homeView: 'tables' })).toThrow(
        expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }),
      )
    })

    test('a switch survives with() and toSnapshot()', () => {
      expect(settings().with({ tablesEnabled: false, homeView: 'till' }).toSnapshot().tablesEnabled).toBe(false)
    })
  })

  describe('promptpay', () => {
    test('the default is bank mode with no target', () => {
      expect(DEFAULT_SHOP_SETTINGS.promptpayMode).toBe('bank')
      expect(DEFAULT_SHOP_SETTINGS.promptpayTarget).toBeNull()
    })

    test('an invalid mode or target is an INVALID_SHOP_SETTINGS domain error', () => {
      expect(() => settings({ promptpayMode: 'qr' as never })).toThrow(
        expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }),
      )
      expect(() => settings({ promptpayTarget: 'abc' })).toThrow(
        expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }),
      )
    })

    test('with() can switch the mode and set the target', () => {
      const changed = settings().with({ promptpayMode: 'static', promptpayTarget: '0812345678' })

      expect(changed.toSnapshot()).toEqual({ ...DEFAULT_SHOP_SETTINGS, promptpayMode: 'static', promptpayTarget: '0812345678' })
    })
  })

  describe('lan printer', () => {
    test('the default is browser printing with no printer set up', () => {
      expect(DEFAULT_SHOP_SETTINGS.receiptPrinterIp).toBeNull()
      expect(DEFAULT_SHOP_SETTINGS.receiptPrinterPort).toBe(9100)
      expect(DEFAULT_SHOP_SETTINGS.receiptPrinterEnabled).toBe(false)
      expect(DEFAULT_SHOP_SETTINGS.cashDrawerEnabled).toBe(false)
    })

    test('an enabled printer with an IP and the drawer survives with() and toSnapshot()', () => {
      const changed = settings().with({
        receiptPrinterIp: '192.168.1.50',
        receiptPrinterEnabled: true,
        cashDrawerEnabled: true,
      })

      expect(changed.toSnapshot()).toEqual({
        ...DEFAULT_SHOP_SETTINGS,
        receiptPrinterIp: '192.168.1.50',
        receiptPrinterEnabled: true,
        cashDrawerEnabled: true,
      })
    })

    test.each<[string, Partial<ShopSettingsProps>]>([
      ['a printer host with spaces', { receiptPrinterIp: '192.168.1. 50' }],
      ['a printer host with a scheme', { receiptPrinterIp: 'http://printer' }],
      ['a printer host over 45 characters', { receiptPrinterIp: `${'a'.repeat(40)}.local` }],
      ['a printer port of 0', { receiptPrinterPort: 0 }],
      ['a printer port above 65535', { receiptPrinterPort: 65536 }],
      ['a fractional printer port', { receiptPrinterPort: 9100.5 }],
      ['a non-boolean printer switch', { receiptPrinterEnabled: 'yes' as never }],
      ['an enabled printer with no IP', { receiptPrinterEnabled: true }],
      ['a drawer without the printer on', { receiptPrinterIp: '192.168.1.50', cashDrawerEnabled: true }],
    ])('rejects %s', (_label, overrides) => {
      expect(() => settings(overrides)).toThrow(
        expect.objectContaining({ code: 'INVALID_SHOP_SETTINGS' }),
      )
    })

    test.each([
      { receiptPrinterIp: '192.168.1.50' },
      { receiptPrinterIp: 'printer.local', receiptPrinterPort: 9101 },
      { receiptPrinterIp: '192.168.1.50', receiptPrinterPort: 1 },
      { receiptPrinterIp: '192.168.1.50', receiptPrinterPort: 65535 },
      { receiptPrinterIp: null },
    ])('accepts the printer value %p', (overrides) => {
      expect(() => settings(overrides)).not.toThrow()
    })
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
      expect(changed.shopName).toBe('TillumiPOS')
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

describe('shopFeaturesFor', () => {
  test.each([
    ['cafe', { tablesEnabled: false, modifiersEnabled: true, homeView: 'till' }],
    ['restaurant', { tablesEnabled: true, modifiersEnabled: true, homeView: 'tables' }],
    ['retail', { tablesEnabled: false, modifiersEnabled: false, homeView: 'till' }],
    ['other', { tablesEnabled: true, modifiersEnabled: true, homeView: 'till' }],
  ] as const)('%s', (type, expected) => {
    expect(shopFeaturesFor(type)).toEqual(expected)
  })

  test('every type gives settings the entity accepts', () => {
    for (const type of SHOP_TYPES) expect(() => settings(shopFeaturesFor(type))).not.toThrow()
  })
})
