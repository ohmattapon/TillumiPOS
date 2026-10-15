import { beforeEach, describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { mockShopSettingsRepository, mockShiftSettingsGuard, mockUnitOfWork } from '../../../../__tests__/mocks'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { GetShopSettingsUseCase } from './get-shop-settings.usecase'
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
  const update = (input: unknown) => new UpdateShopSettingsUseCase(repo, shiftGuard, mockUnitOfWork()).execute(input)

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

  test.each(['tables', 'till'] as const)('accepts %s as the home view and stores it', async (homeView) => {
    const saved = await update({ homeView })

    expect(saved.homeView).toBe(homeView)
    expect(repo.save).toHaveBeenCalledWith(saved)
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
    expect(repo.save).not.toHaveBeenCalled()
  })
})
