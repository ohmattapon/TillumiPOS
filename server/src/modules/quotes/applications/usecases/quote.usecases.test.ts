import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeProduct, makePriceQuote } from '../../../../__tests__/factories'
import {
  mockClock, mockLineOptionsResolver, mockMemberRepository, mockOrderQuoteSource, mockPriceQuoteRepository,
  mockProductRepository, mockPromotionCatalog, mockShopSettingsRepository, mockUnitOfWork,
} from '../../../../__tests__/mocks'
import { MemberEntity } from '../../../../domains/member.domain'
import { PriceQuoteEntity } from '../../../../domains/price-quote.domain'
import { PromotionEntity } from '../../../../domains/promotion.domain'
import { DEFAULT_SHOP_SETTINGS, ShopSettingsEntity } from '../../../../domains/shop-settings.domain'
import { CancelQuoteUseCase } from './cancel-quote.usecase'
import { CreateQuoteUseCase } from './create-quote.usecase'
import { GetQuoteUseCase } from './get-quote.usecase'

// 10:00 on Thursday 2026-10-15 in Bangkok.
const now = new Date('2026-10-15T03:00:00Z')
const actor = { id: 7 }
const branch = { id: 1 }
const promotion = (overrides: Partial<ConstructorParameters<typeof PromotionEntity>[0]> = {}) =>
  new PromotionEntity({
    id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, minSubtotalSatang: 0,
    startsOn: null, endsOn: null, weekdays: null, windowStartMinute: null, windowEndMinute: null,
    audience: 'everyone', isActive: true, imageKey: null, createdAt: now, updatedAt: now, ...overrides,
  })
const member = (isActive = true) =>
  new MemberEntity({ id: 8, name: 'ลูกค้าประจำ', phone: '0812345678', isActive, createdAt: now, updatedAt: now })

let products: ReturnType<typeof mockProductRepository>
let lineOptions: ReturnType<typeof mockLineOptionsResolver>
let settings: ReturnType<typeof mockShopSettingsRepository>
let members: ReturnType<typeof mockMemberRepository>
let catalog: ReturnType<typeof mockPromotionCatalog>
let orders: ReturnType<typeof mockOrderQuoteSource>
let quotes: ReturnType<typeof mockPriceQuoteRepository>
let create: CreateQuoteUseCase

beforeEach(() => {
  products = mockProductRepository()
  lineOptions = mockLineOptionsResolver()
  settings = mockShopSettingsRepository()
  members = mockMemberRepository()
  catalog = mockPromotionCatalog()
  orders = mockOrderQuoteSource()
  quotes = mockPriceQuoteRepository()
  settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  products.findById.mockImplementation(async (id) => makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2500, stockQty: 10 }))
  quotes.create.mockImplementation(async (priced) =>
    new PriceQuoteEntity({ ...priced, id: 5, status: 'open', qrReference: null, saleId: null, createdAt: now }),
  )
  create = new CreateQuoteUseCase(products, lineOptions, settings, members, catalog, orders, quotes, mockClock(now))
})

describe('CreateQuoteUseCase', () => {
  test('prices a cart at the catalogue prices and pins the shop VAT rules', async () => {
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.toSnapshot()).toMatchObject({
      branchId: 1, memberId: null, orderId: null, subtotalSatang: 5000, discountSatang: 0, totalSatang: 5000,
      vatMode: 'inclusive', vatRateBp: 700, promotion: null, createdById: 7, status: 'open',
    })
    expect(quote.lines).toEqual([{ productId: 1, productName: 'สินค้า 1', sku: 'S1', unitPriceSatang: 2500, quantity: 2, options: [] }])
    expect(quote.expiresAt).toEqual(new Date(now.getTime() + 15 * 60_000))
  })

  test('adds the options to the unit price and keeps them on the line', async () => {
    const option = { groupId: 1, groupName: 'ท็อปปิง', optionId: 7, name: 'ไข่มุก', priceSatang: 500, costSatang: 200 }
    lineOptions.resolve.mockResolvedValue({ options: [option], priceSatang: 500, costSatang: 200, key: '7' })
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 1, options: [7] }] }, actor, branch)
    expect(lineOptions.resolve).toHaveBeenCalledWith(1, [7])
    expect(quote.lines[0]).toMatchObject({ unitPriceSatang: 3000, options: [option] })
    expect(quote.totalSatang).toBe(3000)
  })

  test('chooses the promotion that gives the most and prices with it', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ id: 1 }), promotion({ id: 2, name: 'ลด 300', kind: 'fixed', value: 300 })])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.promotion).toEqual({ id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 500 })
    expect(quote).toMatchObject({ discountSatang: 500, totalSatang: 4500 })
  })

  test('a promotion outside its hours is not chosen', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ windowStartMinute: 14 * 60, windowEndMinute: 17 * 60 })])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.promotion).toBeNull()
    expect(quote.discountSatang).toBe(0)
  })

  test('a members-only promotion needs a member, who is kept on the quote', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ audience: 'members' })])
    members.findById.mockResolvedValue(member())
    expect((await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)).promotion).toBeNull()
    const withMember = await create.execute({ lines: [{ productId: 1, quantity: 2 }], memberId: 8 }, actor, branch)
    expect(withMember.promotion?.id).toBe(1)
    expect(withMember).toMatchObject({ memberId: 8, member: { id: 8, code: 'M000008', name: 'ลูกค้าประจำ' } })
  })

  test('refuses an unknown or inactive member', async () => {
    members.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(member(false))
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }], memberId: 8 }, actor, branch)).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' })
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }], memberId: 8 }, actor, branch)).rejects.toMatchObject({ code: 'MEMBER_INACTIVE' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('repeated lines are added together and stock is checked for the total of a product', async () => {
    const merged = await create.execute({ lines: [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 3 }] }, actor, branch)
    expect(merged.lines).toHaveLength(1)
    expect(merged.lines[0]!.quantity).toBe(5)
    await expect(
      create.execute({ lines: [{ productId: 1, quantity: 6 }, { productId: 1, quantity: 6, options: [7] }] }, actor, branch),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  test('refuses an unknown or inactive product', async () => {
    products.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(makeProduct({ isActive: false }))
    await expect(create.execute({ lines: [{ productId: 9, quantity: 1 }] }, actor, branch)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' })
    await expect(create.execute({ lines: [{ productId: 1, quantity: 1 }] }, actor, branch)).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' })
  })

  test("prices an open order from the order's own lines and member, not from the catalogue", async () => {
    orders.read.mockResolvedValue({
      id: 9, memberId: 8,
      items: [{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2000, quantity: 3, options: [] }],
    })
    members.findById.mockResolvedValue(member())
    const quote = await create.execute({ orderId: 9 }, actor, branch)
    expect(orders.read).toHaveBeenCalledWith(9, 1)
    expect(products.findById).not.toHaveBeenCalled()
    expect(quote).toMatchObject({ orderId: 9, memberId: 8, subtotalSatang: 6000, totalSatang: 6000 })
    expect(quote.lines[0]).toMatchObject({ productName: 'ชา', unitPriceSatang: 2000 })
  })

  test('needs the lines or an order, and not both', async () => {
    await expect(create.execute({}, actor, branch)).rejects.toThrow()
    await expect(create.execute({ orderId: 9, lines: [{ productId: 1, quantity: 1 }] }, actor, branch)).rejects.toThrow()
    await expect(create.execute({ orderId: 9, memberId: 8 }, actor, branch)).rejects.toThrow()
  })
})

describe('GetQuoteUseCase and CancelQuoteUseCase', () => {
  test("another branch's quote and an unknown one are not found", async () => {
    quotes.findById.mockResolvedValueOnce(makePriceQuote({ branchId: 2 })).mockResolvedValueOnce(null)
    const get = new GetQuoteUseCase(quotes)
    await expect(get.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
    await expect(get.execute(9, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })

  test('reads without writing anything', async () => {
    quotes.findById.mockResolvedValue(makePriceQuote())
    expect((await new GetQuoteUseCase(quotes).execute(5, 1)).id).toBe(5)
    expect(quotes.save).not.toHaveBeenCalled()
  })

  test('cancels an open quote under its lock, but not one a QR holds', async () => {
    const cancel = new CancelQuoteUseCase(quotes, mockUnitOfWork())
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote())
    expect((await cancel.execute(5, 1)).status).toBe('cancelled')
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ status: 'reserved', qrReference: 'QRABC' }))
    await expect(cancel.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_OPEN' })
    quotes.findByIdForUpdate.mockResolvedValue(makePriceQuote({ branchId: 2 }))
    await expect(cancel.execute(5, 1)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  })
})
