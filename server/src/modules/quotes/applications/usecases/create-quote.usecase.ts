import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { lineKey } from '../../../../domains/modifier.domain'
import { assertPackHasNoOptions, packUnitPriceSatang } from '../../../../domains/product-pack'
import { PriceQuoteEntity, type QuoteLine } from '../../../../domains/price-quote.domain'
import { hasUsesLeft, pickBestPromotion, type PromotionCandidate } from '../../../../domains/promotion.domain'
import type { ProductEntity } from '../../../../domains/product.domain'
import type { SaleMember } from '../../../../domains/sale.domain'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { orderQuoteSourceToken, type IOrderQuoteSource } from '../ports/order-quote-source.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { promotionCatalogToken, type IPromotionCatalog } from '../ports/promotion-catalog.port'
import { promotionUsageToken, type IPromotionUsage } from '../ports/promotion-usage.port'
import { quoteLineOptionsToken, type IQuoteLineOptions } from '../ports/quote-line-options.port'
import { quoteMembersToken, type IQuoteMembers } from '../ports/quote-members.port'
import { quoteProductsToken, type IQuoteProducts } from '../ports/quote-products.port'
import { quoteShopRulesToken, type IQuoteShopRules } from '../ports/quote-shop-rules.port'
import { createQuoteSchema } from '../schemas/quote-schemas'

/**
 * Command: prices a cart (or an open order) with the catalogue and the shop's rules as they are now,
 * chooses the promotion that gives the most, and pins the result. Nothing is locked or deducted: stock is
 * checked so the till hears about a shortage early, and again when the sale is made.
 */
@injectable()
export class CreateQuoteUseCase {
  constructor(
    @inject(quoteProductsToken) private readonly products: IQuoteProducts,
    @inject(quoteLineOptionsToken) private readonly lineOptions: IQuoteLineOptions,
    @inject(quoteShopRulesToken) private readonly settings: IQuoteShopRules,
    @inject(quoteMembersToken) private readonly members: IQuoteMembers,
    @inject(promotionCatalogToken) private readonly catalog: IPromotionCatalog,
    @inject(orderQuoteSourceToken) private readonly orders: IOrderQuoteSource,
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
    @inject(promotionUsageToken) private readonly usage: IPromotionUsage,
  ) {}

  async execute(input: unknown, actor: { id: number }, branch: { id: number }) {
    const dto = createQuoteSchema.parse(input)
    const now = this.clock.now()
    const shop = await this.settings.get()

    let memberId: number | null
    let lines: QuoteLine[]
    if (dto.orderId !== undefined) {
      const order = await this.orders.read(dto.orderId, branch.id)
      memberId = order.memberId
      lines = order.items.map((item) => ({ ...item, options: [...item.options] }))
    } else {
      memberId = dto.memberId ?? null
      lines = await this.priceLines(dto.lines!, branch.id)
    }

    let member: SaleMember | null = null
    if (memberId !== null) {
      const found = await this.members.findById(memberId)
      if (!found) throw new DomainNotFoundError('ไม่พบสมาชิก', 'MEMBER_NOT_FOUND')
      found.assertActive()
      member = { id: found.id, code: found.code, name: found.name }
    }

    const subtotalSatang = lines.reduce((total, line) => total + line.unitPriceSatang * line.quantity, 0)
    // One question for both a cart and an order: an order's lines carry no category.
    const categories = await this.products.categoriesOf([...new Set(lines.map((line) => line.productId))])
    const best = pickBestPromotion(
      await this.dropUsedUp(await this.catalog.activePromotions(), member !== null, memberId),
      {subtotalSatang,
      hasMember: member !== null,
      at: now,
      timeZone: shop.timeZone,
      lines: lines.map((line) => ({
        productId: line.productId,
        categoryId: categories.get(line.productId) ?? null,
        unitPriceSatang: line.unitPriceSatang,
        quantity: line.quantity,
        isPack: line.packId !== null,
        lineTotalSatang: line.unitPriceSatang * line.quantity,
      })),
      // Task 4 wires the typed coupon code into the context.
      couponCode: null,
      },
    )

    return this.quotes.create(
      PriceQuoteEntity.price(
        {
          branchId: branch.id,
          memberId,
          member,
          orderId: dto.orderId ?? null,
          lines,
          promotion: best ? best.promotion.toSalePromotion(best.discountSatang) : null,
          vatMode: shop.vatMode,
          vatRateBp: shop.vatRateBp,
          createdById: actor.id,
        },
        now,
      ),
    )
  }

  /** A quote pins a price but not a slot: a promotion every slot of which is spent is simply not offered. No row is locked, because nothing is being claimed yet. */
  private async dropUsedUp<T extends PromotionCandidate>(promotions: readonly T[], hasMember: boolean, memberId: number | null) {
    const kept: T[] = []
    for (const promotion of promotions) {
      const limits = { maxUses: promotion.maxUses, maxUsesPerMember: promotion.maxUsesPerMember }
      if (limits.maxUses === null && limits.maxUsesPerMember === null) {
        kept.push(promotion)
        continue
      }
      if (hasUsesLeft(limits, await this.usage.countUses(promotion.id, memberId), hasMember)) kept.push(promotion)
    }
    return kept
  }

  /** The same product with the same options is one line; stock is the product's, so checked for the total. */
  private async priceLines(requested: { productId: number; quantity: number; options?: number[]; packId?: number }[], branchId: number) {
    const wanted = new Map<string, { productId: number; optionIds: number[]; quantity: number; packId: number | null }>()
    for (const { productId, quantity, options = [], packId = null } of requested) {
      if (packId !== null) assertPackHasNoOptions(true, options.length)
      const optionIds = [...options].sort((a, b) => a - b)
      const key = `${productId}:${lineKey(optionIds.map((optionId) => ({ optionId })))}:${packId ?? 0}`
      const existing = wanted.get(key)
      if (existing) existing.quantity += quantity
      else wanted.set(key, { productId, optionIds, quantity, packId })
    }

    const demand = new Map<number, number>()
    const packsByKey = new Map<string, { id: number; size: number; unitPriceSatang: number }>()
    const productsById = new Map<number, ProductEntity>()
    for (const line of wanted.values()) {
      let product = productsById.get(line.productId)
      if (!product) {
        const found = await this.products.findById(line.productId, branchId)
        if (!found) throw new DomainError('ไม่พบสินค้ารหัส ' + line.productId, 'PRODUCT_NOT_FOUND', { productId: line.productId })
        product = found
        productsById.set(line.productId, product)
      }
      if (line.packId === null) {
        demand.set(line.productId, (demand.get(line.productId) ?? 0) + line.quantity)
      } else {
        const pack = product.packForSale(line.packId)
        demand.set(line.productId, (demand.get(line.productId) ?? 0) + line.quantity * pack.size)
        packsByKey.set(`${line.productId}:${line.packId}`, {
          id: pack.id,
          size: pack.size,
          unitPriceSatang: packUnitPriceSatang(product.priceSatang, pack),
        })
      }
    }
    for (const [productId, quantity] of demand) {
      productsById.get(productId)!.assertSellable(quantity)
    }

    const lines: QuoteLine[] = []
    for (const line of wanted.values()) {
      const product = productsById.get(line.productId)!
      const resolved = await this.lineOptions.resolve(line.productId, line.optionIds)
      const pack = line.packId === null ? null : packsByKey.get(`${line.productId}:${line.packId}`)!
      lines.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang: pack ? pack.unitPriceSatang : product.priceSatang + resolved.priceSatang,
        quantity: line.quantity,
        options: pack ? [] : resolved.options,
        packId: pack?.id ?? null,
        packSize: pack?.size ?? 1,
      })
    }
    return lines
  }
}
