import { beforeEach, describe, expect, test } from 'bun:test'
import { client, ok, resetDatabase, seedProduct, signIn, type Session } from '../../../test/harness'

let owner: Session
let cashier: Session

beforeEach(async () => {
  await resetDatabase()
  owner = await signIn('owner')
  cashier = await signIn('cashier')
})

const cash = (amountSatang: number) => [{ method: 'cash' as const, amountSatang }]

describe('shop settings', () => {
  test('a shop that was never configured runs with the defaults', async () => {
    expect(ok(await owner.api.settings.get())).toEqual({
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
      pointsEnabled: false,
      pointsEarnSatang: 2500,
      pointsRedeemSatang: 100,
      pointsMinRedeem: 10,
      logoUrl: null,
    })
  })

  test('the owner switches features off and they stay off', async () => {
    ok(await owner.api.settings.patch({ tablesEnabled: false, modifiersEnabled: false }))

    expect(ok(await owner.api.settings.get())).toMatchObject({
      tablesEnabled: false,
      modifiersEnabled: false,
    })
  })

  test('the owner changes some settings and the rest keep their values', async () => {
    const updated = ok(
      await owner.api.settings.patch({ shopName: 'ร้านสมชาย', taxId: '0105500000000', currency: 'USD', locale: 'en' }),
    )

    expect(updated).toMatchObject({
      shopName: 'ร้านสมชาย',
      taxId: '0105500000000',
      currency: 'USD',
      locale: 'en',
      vatMode: 'inclusive',
      vatRateBp: 700,
    })
    expect(ok(await owner.api.settings.get())).toEqual(updated)
  })

  test('the owner sets the paper width and the line under every receipt, and clears the line by blanking it', async () => {
    const updated = ok(await owner.api.settings.patch({ receiptPaperMm: 58, receiptFooter: '  ขอบคุณที่ใช้บริการ  ' }))
    expect(updated).toMatchObject({ receiptPaperMm: 58, receiptFooter: 'ขอบคุณที่ใช้บริการ' })

    expect(ok(await owner.api.settings.patch({ receiptFooter: '' }))).toMatchObject({ receiptPaperMm: 58, receiptFooter: null })
  })

  test('settings persist across further updates', async () => {
    ok(await owner.api.settings.patch({ shopName: 'ร้านสมชาย' }))
    ok(await owner.api.settings.patch({ vatMode: 'exclusive' }))

    expect(ok(await owner.api.settings.get())).toMatchObject({ shopName: 'ร้านสมชาย', vatMode: 'exclusive' })
  })

  test('a blank optional field is cleared', async () => {
    ok(await owner.api.settings.patch({ taxId: '0105500000000', phone: '02-000-0000' }))

    const cleared = ok(await owner.api.settings.patch({ taxId: '', phone: null }))

    expect(cleared).toMatchObject({ taxId: null, phone: null })
  })

  test('the currency code is normalised to upper case', async () => {
    expect(ok(await owner.api.settings.patch({ currency: 'jpy' })).currency).toBe('JPY')
  })

  test('any signed-in user can read the settings, but only the owner can change them', async () => {
    expect((await cashier.api.settings.get()).status).toBe(200)
    expect((await client().settings.get()).status).toBe(401)

    const attempt = await cashier.api.settings.patch({ shopName: 'ร้านของฉัน' })

    expect(attempt.status).toBe(403)
    expect(ok(await owner.api.settings.get()).shopName).toBe('TillumiPOS')
  })

  test.each([
    [{ vatRateBp: 10_001 }],
    [{ vatRateBp: -1 }],
    [{ vatMode: 'maybe' }],
    [{ shopName: '' }],
    [{ locale: 'fr' }],
    [{ receiptPaperMm: 72 }],
    [{ currency: 'BAHT' }],
  ])('rejects %p as a validation error and changes nothing', async (body) => {
    const result = await owner.api.settings.patch(body as never)

    expect(result.status).toBe(422)
    expect(ok(await owner.api.settings.get()).shopName).toBe('TillumiPOS')
  })

  test('an unknown time zone is refused by the rules, with its own code', async () => {
    const result = await owner.api.settings.patch({ timeZone: 'Mars/Olympus' })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    expect(ok(await owner.api.settings.get()).timeZone).toBe('Asia/Bangkok')
  })

  test('the owner switches to static PromptPay with a target, and it round-trips', async () => {
    const updated = ok(await owner.api.settings.patch({ promptpayMode: 'static', promptpayTarget: '0812345678' }))

    expect(updated).toMatchObject({ promptpayMode: 'static', promptpayTarget: '0812345678' })
    expect(ok(await owner.api.settings.get())).toMatchObject({ promptpayMode: 'static', promptpayTarget: '0812345678' })
  })

  test.each([[{ promptpayMode: 'qr' }], [{ promptpayTarget: '081-234-5678' }]])(
    'rejects %p as a validation error and changes nothing',
    async (body) => {
      const result = await owner.api.settings.patch(body as never)

      expect(result.status).toBe(422)
      expect(ok(await owner.api.settings.get())).toMatchObject({ promptpayMode: 'bank', promptpayTarget: null })
    },
  )

  test('a digit-only PromptPay target of the wrong length is refused by the rules, with its own code', async () => {
    const result = await owner.api.settings.patch({ promptpayTarget: '081234567' })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    expect(ok(await owner.api.settings.get()).promptpayTarget).toBeNull()
  })

  test('the owner sets the LAN printer and the drawer, and they round-trip', async () => {
    const updated = ok(
      await owner.api.settings.patch({
        receiptPrinterIp: '192.168.1.50',
        receiptPrinterPort: 9100,
        receiptPrinterEnabled: true,
        cashDrawerEnabled: true,
      }),
    )

    expect(updated).toMatchObject({
      receiptPrinterIp: '192.168.1.50',
      receiptPrinterPort: 9100,
      receiptPrinterEnabled: true,
      cashDrawerEnabled: true,
    })
    expect(ok(await owner.api.settings.get())).toMatchObject({
      receiptPrinterIp: '192.168.1.50',
      receiptPrinterEnabled: true,
      cashDrawerEnabled: true,
    })
  })

  test.each([[{ receiptPrinterPort: 0 }], [{ receiptPrinterPort: 65536 }], [{ receiptPrinterIp: 'http://printer' }]])(
    'rejects %p as a validation error and changes nothing',
    async (body) => {
      const result = await owner.api.settings.patch(body as never)

      expect(result.status).toBe(422)
      expect(ok(await owner.api.settings.get())).toMatchObject({ receiptPrinterIp: null })
    },
  )

  test.each([[{ receiptPrinterEnabled: true }], [{ receiptPrinterIp: '192.168.1.50', cashDrawerEnabled: true }]])(
    'refuses %p by the rules, with its own code',
    async (body) => {
      const result = await owner.api.settings.patch(body as never)

      expect(result.status).toBe(400)
      expect(result.error?.value).toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
      expect(ok(await owner.api.settings.get())).toMatchObject({
        receiptPrinterEnabled: false,
        cashDrawerEnabled: false,
      })
    },
  )
})

describe('sales follow the settings', () => {
  test('an exclusive-VAT shop adds VAT on top and the sale records how it was priced', async () => {
    ok(await owner.api.settings.patch({ vatMode: 'exclusive', vatRateBp: 700 }))
    const tea = await seedProduct(owner, { priceSatang: 10_000, stock: 5 })

    const sale = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(10_700) }),
    )

    expect(sale).toMatchObject({
      subtotalSatang: 10_000,
      vatSatang: 700,
      totalSatang: 10_700,
      changeSatang: 0,
      vatMode: 'exclusive',
      vatRateBp: 700,
    })
  })

  test('paying only the shelf price is short when VAT is added on top', async () => {
    ok(await owner.api.settings.patch({ vatMode: 'exclusive' }))
    const tea = await seedProduct(owner, { priceSatang: 10_000, stock: 5 })

    const result = await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(10_000) })

    expect(result.status).toBe(400)
    expect(result.error?.value).toMatchObject({ code: 'UNDERPAID' })
  })

  test('a shop without VAT charges none', async () => {
    ok(await owner.api.settings.patch({ vatMode: 'none' }))
    const tea = await seedProduct(owner, { priceSatang: 10_000, stock: 5 })

    const sale = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(10_000) }),
    )

    expect(sale).toMatchObject({ vatSatang: 0, totalSatang: 10_000, vatMode: 'none', vatRateBp: 0 })
  })

  test('changing the settings never changes a sale that was already made', async () => {
    const tea = await seedProduct(owner, { priceSatang: 10_700, stock: 5 })
    const before = ok(
      await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(10_700) }),
    )
    expect(before).toMatchObject({ vatMode: 'inclusive', vatRateBp: 700, vatSatang: 700 })

    ok(await owner.api.settings.patch({ vatMode: 'exclusive', vatRateBp: 1000 }))

    const detail = ok(await owner.api.sales({ id: before.id }).get())
    const listed = ok(await owner.api.sales.get({ query: {} })).items.find((sale) => sale.id === before.id)
    expect(detail).toEqual(before)
    expect(listed).toMatchObject({ vatMode: 'inclusive', vatRateBp: 700, vatSatang: 700, totalSatang: 10_700 })
  })

  test('the receipt number day follows the shop time zone', async () => {
    const zone = 'Pacific/Kiritimati' // UTC+14: the date here is often a day ahead of Bangkok
    ok(await owner.api.settings.patch({ timeZone: zone }))
    const tea = await seedProduct(owner, { stock: 5 })

    const sale = ok(await cashier.api.sales.post({ items: [{ productId: tea.id, quantity: 1 }], payments: cash(1000) }))

    const expectedDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date()).replaceAll('-', '')
    expect(sale.receiptNo).toStartWith(`MAIN-${expectedDay}-`)
  })
})
