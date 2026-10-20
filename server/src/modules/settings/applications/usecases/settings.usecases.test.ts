import { mockAuditLog as auditMock, mockUnitOfWork as auditUnitOfWork } from '../../../../__tests__/mocks'
import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { mockIdGenerator, mockMediaStorage, mockShopSettingsRepository, mockShiftSettingsGuard, mockUnitOfWork } from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { GetShopSettingsUseCase } from './get-shop-settings.usecase'
import { RemoveShopLogoUseCase } from './remove-shop-logo.usecase'
import { SetShopLogoUseCase } from './set-shop-logo.usecase'
import { UpdateShopSettingsUseCase } from './update-shop-settings.usecase'

let repo: ReturnType<typeof mockShopSettingsRepository>
let shiftGuard: ReturnType<typeof mockShiftSettingsGuard>
const current = new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, shopName: 'ร้านสมชาย', taxId: '0105500000000' })

beforeEach(() => {
  repo = mockShopSettingsRepository()
  shiftGuard = mockShiftSettingsGuard()
  repo.get.mockResolvedValue(current)
  repo.getForUpdate.mockResolvedValue(current)
  repo.save.mockImplementation(async (settings) => settings)
})

describe('GetShopSettingsUseCase', () => {
  test('returns the stored settings', async () => {
    expect(await new GetShopSettingsUseCase(repo).execute()).toBe(current)
  })
})

describe('UpdateShopSettingsUseCase', () => {
  const update = (input: unknown) => new UpdateShopSettingsUseCase(repo, shiftGuard, mockUnitOfWork(), auditMock()).execute(input, { id: 1, displayName: 'ผู้ทดสอบ' })

  test('changes only the given fields and stores the result', async () => {
    const saved = await update({ vatMode: 'exclusive', vatRateBp: 1000 })

    expect(saved.toSnapshot()).toEqual({ ...current.toSnapshot(), vatMode: 'exclusive', vatRateBp: 1000 })
    expect(repo.save).toHaveBeenCalledWith(saved)
  })

  test('an empty change set stores the settings unchanged', async () => {
    expect((await update({})).toSnapshot()).toEqual(current.toSnapshot())
  })

  test('a blank optional field is cleared, not stored as an empty string', async () => {
    const saved = await update({ taxId: '', address: '   ' })

    expect(saved.taxId).toBeNull()
    expect(saved.address).toBeNull()
  })

  test('text is trimmed and the currency is upper-cased', async () => {
    const saved = await update({ shopName: '  ร้านใหม่  ', currency: ' usd ' })

    expect(saved).toMatchObject({ shopName: 'ร้านใหม่', currency: 'USD' })
  })

  test('turns a feature off and records it in the audit log', async () => {
    const audit = auditMock()
    const saved = await new UpdateShopSettingsUseCase(repo, shiftGuard, mockUnitOfWork(), audit).execute(
      { modifiersEnabled: false },
      { id: 1, displayName: 'ผู้ทดสอบ' },
    )

    expect(saved.modifiersEnabled).toBe(false)
    expect(repo.save).toHaveBeenCalledWith(saved)
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.objectContaining({ after: expect.objectContaining({ modifiersEnabled: false }) }),
    )
  })

  test('refuses to turn tables off while the floor plan is home, and saves nothing', async () => {
    repo.getForUpdate.mockResolvedValue(current.with({ homeView: 'tables' }))

    await expect(update({ tablesEnabled: false })).rejects.toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    expect(repo.save).not.toHaveBeenCalled()
  })

  test('turns tables off and the till home in one change', async () => {
    repo.getForUpdate.mockResolvedValue(current.with({ homeView: 'tables' }))

    expect(await update({ tablesEnabled: false, homeView: 'till' })).toMatchObject({ tablesEnabled: false, homeView: 'till' })
  })

  test.each(['tables', 'till'] as const)('accepts %s as the home view and stores it', async (homeView) => {
    const saved = await update({ homeView })

    expect(saved.homeView).toBe(homeView)
    expect(repo.save).toHaveBeenCalledWith(saved)
  })

  test('stores a static PromptPay mode with its target', async () => {
    const saved = await update({ promptpayMode: 'static', promptpayTarget: '0812345678' })

    expect(saved.toSnapshot()).toEqual({ ...current.toSnapshot(), promptpayMode: 'static', promptpayTarget: '0812345678' })
    expect(repo.save).toHaveBeenCalledWith(saved)
  })

  test('a blank PromptPay target is cleared, not stored as an empty string', async () => {
    const saved = await update({ promptpayTarget: '   ' })

    expect(saved.promptpayTarget).toBeNull()
  })

  test('stores a LAN printer setup with its drawer', async () => {
    const saved = await update({
      receiptPrinterIp: ' 192.168.1.50 ',
      receiptPrinterPort: 9100,
      receiptPrinterEnabled: true,
      cashDrawerEnabled: true,
    })

    expect(saved.toSnapshot()).toEqual({
      ...current.toSnapshot(),
      receiptPrinterIp: '192.168.1.50',
      receiptPrinterPort: 9100,
      receiptPrinterEnabled: true,
      cashDrawerEnabled: true,
    })
    expect(repo.save).toHaveBeenCalledWith(saved)
  })

  test('a blank printer IP is cleared, not stored as an empty string', async () => {
    const saved = await update({ receiptPrinterIp: '   ' })

    expect(saved.receiptPrinterIp).toBeNull()
  })

  test.each([
    ['an unknown PromptPay mode', { promptpayMode: 'qr' }],
    ['a non-digit PromptPay target', { promptpayTarget: '081-234-5678' }],
    ['a printer host with a scheme', { receiptPrinterIp: 'http://printer' }],
    ['a printer port of 0', { receiptPrinterPort: 0 }],
    ['a printer port above 65535', { receiptPrinterPort: 65536 }],
  ])('rejects %s before reading or storing anything', async (_label, input) => {
    await expect(update(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.getForUpdate).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  test('a digit-only target of the wrong length is a domain error, and nothing is stored', async () => {
    await expect(update({ promptpayTarget: '081234567' })).rejects.toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    expect(repo.save).not.toHaveBeenCalled()
  })

  test('checks active shifts before changing currency', async () => {
    await update({ currency: 'USD' })

    expect(shiftGuard.assertCurrencyChangeAllowed).toHaveBeenCalledTimes(1)
  })

  test('does not check shifts for unrelated settings changes', async () => {
    await update({ shopName: 'ร้านใหม่' })

    expect(shiftGuard.assertCurrencyChangeAllowed).not.toHaveBeenCalled()
  })

  test.each([
    ['an empty shop name', { shopName: '   ' }],
    ['a VAT rate above 100%', { vatRateBp: 10_001 }],
    ['a fractional VAT rate', { vatRateBp: 7.5 }],
    ['an unknown VAT mode', { vatMode: 'maybe' }],
    ['an unsupported language', { locale: 'fr' }],
    ['a paper width no printer uses', { receiptPaperMm: 72 }],
    ['a receipt footer over 200 characters', { receiptFooter: 'x'.repeat(201) }],
    ['a currency code of the wrong length', { currency: 'BAHT' }],
    ['an unknown home view', { homeView: 'floor' }],
  ])('rejects %s before reading or storing anything', async (_label, input) => {
    await expect(update(input)).rejects.toBeInstanceOf(ZodError)
    expect(repo.getForUpdate).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
  })

  test('a value the schema accepts but the rules refuse is a domain error, and nothing is stored', async () => {
    await expect(update({ timeZone: 'Mars/Olympus' })).rejects.toBeInstanceOf(DomainError)
    await expect(update({ timeZone: 'Mars/Olympus' })).rejects.toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    await expect(update({ receiptPrinterEnabled: true })).rejects.toMatchObject({ code: 'INVALID_SHOP_SETTINGS' })
    await expect(update({ receiptPrinterIp: '192.168.1.50', cashDrawerEnabled: true })).rejects.toMatchObject({
      code: 'INVALID_SHOP_SETTINGS',
    })
    expect(repo.save).not.toHaveBeenCalled()
  })
})

describe('the receipt logo', () => {
  const actor = { id: 1, displayName: 'ผู้ทดสอบ' }
  const png = new Blob([new Uint8Array(8)], { type: 'image/png' })
  const withLogo = new ShopSettingsEntity({ ...DEFAULT_SHOP_SETTINGS, logoKey: 'logo/old.png' })

  const setup = (stored: ShopSettingsEntity) => {
    const settings = mockShopSettingsRepository()
    settings.getForUpdate.mockResolvedValue(stored)
    settings.save.mockImplementation(async (value) => value)
    settings.get.mockResolvedValue(stored)
    const media = mockMediaStorage()
    const audit = auditMock()
    return { settings, media, audit, set: new SetShopLogoUseCase(settings, media, mockUnitOfWork(), audit, mockIdGenerator()), remove: new RemoveShopLogoUseCase(settings, media, mockUnitOfWork(), audit) }
  }

  test('setting a logo stores the picture under a logo key, saves the key, audits it and drops the old picture', async () => {
    const { settings, media, audit, set } = setup(withLogo)

    await set.execute(png, actor)

    const key = media.put.mock.calls[0]![0]
    expect(key).toBe('logo/id-1.png')
    expect(settings.save.mock.calls[0]![0].logoKey).toBe(key)
    expect(media.delete).toHaveBeenCalledWith('logo/old.png')
    expect(audit.record.mock.calls[0]![2]).toMatchObject({ action: 'settings.logo_set', before: { hasLogo: true }, after: { hasLogo: true } })
  })

  test('a file that is not JPEG, PNG or WebP is refused before anything is stored', async () => {
    const { settings, media, set } = setup(current)

    await expect(set.execute(new Blob(['x'], { type: 'image/gif' }), actor)).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' })
    expect(media.put).not.toHaveBeenCalled()
    expect(settings.save).not.toHaveBeenCalled()
  })

  test('when saving fails the new picture is removed and the old logo stays', async () => {
    const { settings, media, set } = setup(withLogo)
    settings.save.mockRejectedValue(new Error('database down'))

    await expect(set.execute(png, actor)).rejects.toThrow('database down')

    expect(media.delete).toHaveBeenCalledWith(media.put.mock.calls[0]![0])
    expect(media.delete).not.toHaveBeenCalledWith('logo/old.png')
  })

  test('a failed cleanup of the old picture does not fail the request', async () => {
    const { media, set } = setup(withLogo)
    media.delete.mockRejectedValue(new Error('storage down'))

    await expect(set.execute(png, actor)).resolves.toBeDefined()
  })

  test('removing the logo clears the key, audits it and drops the picture', async () => {
    const { settings, media, audit, remove } = setup(withLogo)

    await remove.execute(actor)

    expect(settings.save.mock.calls[0]![0].logoKey).toBeNull()
    expect(media.delete).toHaveBeenCalledWith('logo/old.png')
    expect(audit.record.mock.calls[0]![2]).toMatchObject({ action: 'settings.logo_removed', before: { hasLogo: true }, after: { hasLogo: false } })
  })

  test('removing a logo that is not there changes and audits nothing', async () => {
    const { settings, media, audit, remove } = setup(current)

    await remove.execute(actor)

    expect(settings.save).not.toHaveBeenCalled()
    expect(media.delete).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })
})
