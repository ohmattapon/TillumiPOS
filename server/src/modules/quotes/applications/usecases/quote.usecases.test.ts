import 'reflect-metadata'
import { beforeEach, describe, expect, test } from 'bun:test'
import { makeProduct, makePriceQuote } from '../../../../__tests__/factories'
import {
  mockClock, mockLineOptionsResolver, mockMemberRepository, mockOrderQuoteSource, mockPriceQuoteRepository,
  mockPromotionCatalog, mockQuotePoints, mockQuoteProducts, mockShopSettingsRepository, mockUnitOfWork,
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
    audience: 'everyone', isActive: true, scope: null, imageKey: null, createdAt: now, updatedAt: now, ...overrides,
  })
const member = (isActive = true) =>
  new MemberEntity({ id: 8, name: 'ลูกค้าประจำ', phone: '0812345678', isActive, createdAt: now, updatedAt: now })
/** A shop that gives one point per 25 baht paid and pays 1 baht back for each point, from 10 points up. */
const pointsShop = () =>
  new ShopSettingsEntity({
    ...DEFAULT_SHOP_SETTINGS,
    pointsEnabled: true, pointsEarnSatang: 2500, pointsRedeemSatang: 100, pointsMinRedeem: 10,
  })

let products: ReturnType<typeof mockQuoteProducts>
let lineOptions: ReturnType<typeof mockLineOptionsResolver>
let settings: ReturnType<typeof mockShopSettingsRepository>
let members: ReturnType<typeof mockMemberRepository>
let catalog: ReturnType<typeof mockPromotionCatalog>
let orders: ReturnType<typeof mockOrderQuoteSource>
let quotes: ReturnType<typeof mockPriceQuoteRepository>
let points: ReturnType<typeof mockQuotePoints>
let create: CreateQuoteUseCase

beforeEach(() => {
  products = mockQuoteProducts()
  lineOptions = mockLineOptionsResolver()
  settings = mockShopSettingsRepository()
  members = mockMemberRepository()
  catalog = mockPromotionCatalog()
  orders = mockOrderQuoteSource()
  quotes = mockPriceQuoteRepository()
  points = mockQuotePoints()
  settings.get.mockResolvedValue(new ShopSettingsEntity(DEFAULT_SHOP_SETTINGS))
  products.findById.mockImplementation(async (id) => makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2500, stockQty: 10 }))
  quotes.create.mockImplementation(async (priced) =>
    new PriceQuoteEntity({ ...priced, id: 5, status: 'open', qrReference: null, saleId: null, createdAt: now }),
  )
  create = new CreateQuoteUseCase(products, lineOptions, settings, members, catalog, orders, quotes, mockClock(now), points)
})

describe('CreateQuoteUseCase', () => {
  test('prices a cart at the catalogue prices and pins the shop VAT rules', async () => {
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.toSnapshot()).toMatchObject({
      branchId: 1, memberId: null, orderId: null, subtotalSatang: 5000, discountSatang: 0, totalSatang: 5000,
      vatMode: 'inclusive', vatRateBp: 700, promotion: null, createdById: 7, status: 'open',
    })
    expect(quote.lines).toEqual([{ productId: 1, productName: 'สินค้า 1', sku: 'S1', unitPriceSatang: 2500, quantity: 2, options: [], packId: null, packSize: 1 }])
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

  test('pins a pack at its price and checks the pieces it needs', async () => {
    products.findById.mockImplementation(async (id) =>
      makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2000, costSatang: 1200, stockQty: 30, packs: [{ id: 5, barcode: 'SODA6', size: 6, priceSatang: 10000, isActive: true }] }),
    )
    const quote = await create.execute({ lines: [{ productId: 3, quantity: 2, packId: 5 }] }, actor, branch)
    expect(quote.lines).toEqual([{ productId: 3, productName: 'สินค้า 3', sku: 'S3', unitPriceSatang: 10000, quantity: 2, options: [], packId: 5, packSize: 6 }])
    expect(quote).toMatchObject({ subtotalSatang: 20000 })
  })

  test('a pack with options is refused', async () => {
    products.findById.mockImplementation(async (id) =>
      makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2000, stockQty: 30, packs: [{ id: 5, barcode: 'SODA6', size: 6, priceSatang: 10000, isActive: true }] }),
    )
    await expect(create.execute({ lines: [{ productId: 3, quantity: 1, packId: 5, options: [7] }] }, actor, branch))
      .rejects.toMatchObject({ code: 'PACK_WITH_OPTIONS' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('a pack is refused when its pieces exceed the stock', async () => {
    products.findById.mockImplementation(async (id) =>
      makeProduct({ id, name: `สินค้า ${id}`, sku: `S${id}`, priceSatang: 2000, stockQty: 10, packs: [{ id: 5, barcode: 'SODA6', size: 6, priceSatang: 10000, isActive: true }] }),
    )
    await expect(create.execute({ lines: [{ productId: 3, quantity: 2, packId: 5 }] }, actor, branch))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('a quote pins the points it redeemed and lowers the total by what they are worth', async () => {
    settings.get.mockResolvedValue(pointsShop())
    members.findById.mockResolvedValue(member())
    points.balanceOf.mockResolvedValue(50)

    const quote = await create.execute(
      { memberId: 8, lines: [{ productId: 1, quantity: 2 }], redeemPoints: 20 },
      actor,
      branch,
    )

    expect(points.balanceOf).toHaveBeenCalledWith(8)
    expect(quote.toSnapshot()).toMatchObject({
      subtotalSatang: 5000, discountSatang: 2000, totalSatang: 3000,
      pointsRedeemed: 20, pointsDiscountSatang: 2000, pointsRule: { earnSatang: 2500, redeemSatang: 100, minRedeem: 10 },
    })
  })

  test('redeeming more than the cart can pay for is POINTS_REDEEM_INVALID', async () => {
    settings.get.mockResolvedValue(pointsShop())
    members.findById.mockResolvedValue(member())
    points.balanceOf.mockResolvedValue(500)

    // 25 baht is 25 points at 1 baht each, so 26 is over the payable amount.
    await expect(create.execute({ memberId: 8, lines: [{ productId: 1, quantity: 1 }], redeemPoints: 26 }, actor, branch))
      .rejects.toMatchObject({ code: 'POINTS_REDEEM_INVALID' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('redeeming while the shop has points switched off is POINTS_DISABLED', async () => {
    members.findById.mockResolvedValue(member())
    points.balanceOf.mockResolvedValue(50)

    await expect(create.execute({ memberId: 8, lines: [{ productId: 1, quantity: 2 }], redeemPoints: 10 }, actor, branch))
      .rejects.toMatchObject({ code: 'POINTS_DISABLED' })
    expect(quotes.create).not.toHaveBeenCalled()
  })

  test('redeeming without a member is MEMBER_REQUIRED', async () => {
    settings.get.mockResolvedValue(pointsShop())
    points.balanceOf.mockResolvedValue(50)

    await expect(create.execute({ lines: [{ productId: 1, quantity: 2 }], redeemPoints: 10 }, actor, branch))
      .rejects.toMatchObject({ code: 'MEMBER_REQUIRED' })
    expect(points.balanceOf).not.toHaveBeenCalled()
  })

  test('chooses the promotion that gives the most and prices with it', async () => {
    catalog.activePromotions.mockResolvedValue([promotion({ id: 1 }), promotion({ id: 2, name: 'ลด 300', kind: 'fixed', value: 300 })])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }] }, actor, branch)
    expect(quote.promotion).toEqual({ id: 1, name: 'ลด 10%', kind: 'percent', value: 1000, maxDiscountSatang: null, discountSatang: 500 })
    expect(quote).toMatchObject({ discountSatang: 500, totalSatang: 4500 })
  })

  test('a promotion limited to a category is priced on the lines of that category only', async () => {
    products.categoriesOf.mockImplementation(async (ids) => new Map(ids.map((id) => [id, id === 1 ? 4 : null])))
    catalog.activePromotions.mockResolvedValue([
      promotion({ id: 1, value: 2000, scope: { productIds: [], categoryIds: [4] } }),
      promotion({ id: 2, name: 'ลด 300', kind: 'fixed', value: 300 }),
    ])
    const quote = await create.execute({ lines: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }] }, actor, branch)
    expect(products.categoriesOf).toHaveBeenCalledWith([1, 2])
    expect(quote).toMatchObject({ subtotalSatang: 7500, discountSatang: 1000, promotion: { id: 1, discountSatang: 1000 } })
  })

  test('an order is asked for its categories the same way as a cart', async () => {
    orders.read.mockResolvedValue({
      id: 9,
      memberId: null,
      items: [{ productId: 3, productName: 'เค้ก', sku: 'S3', unitPriceSatang: 4000, quantity: 1, options: [], packId: null, packSize: 1 }],
    })
    catalog.activePromotions.mockResolvedValue([promotion({ value: 5000, scope: { productIds: [3], categoryIds: [] } })])
    const quote = await create.execute({ orderId: 9 }, actor, branch)
    expect(products.categoriesOf).toHaveBeenCalledWith([3])
    expect(quote).toMatchObject({ discountSatang: 2000, promotion: { id: 1 } })
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
      items: [{ productId: 1, productName: 'ชา', sku: 'TEA', unitPriceSatang: 2000, quantity: 3, options: [], packId: null, packSize: 1 }],
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
