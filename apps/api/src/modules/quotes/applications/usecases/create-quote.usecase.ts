import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { lineKey } from '../../../../domains/modifier.domain'
import { PriceQuoteEntity, type QuoteLine } from '../../../../domains/price-quote.domain'
import { pickBestPromotion } from '../../../../domains/promotion.domain'
import type { ProductEntity } from '../../../../domains/product.domain'
import type { SaleMember } from '../../../../domains/sale.domain'
import { memberRepositoryToken, type IMemberRepository } from '../../../members/applications/ports/member.repository'
import { lineOptionsResolverToken, type ILineOptionsResolver } from '../../../modifiers/applications/ports/line-options-resolver.port'
import { productRepositoryToken, type IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IClock } from '../../../shared/ports/clock.port'
import { TOKENS } from '../../../tokens'
import { orderQuoteSourceToken, type IOrderQuoteSource } from '../ports/order-quote-source.port'
import { priceQuoteRepositoryToken, type IPriceQuoteRepository } from '../ports/price-quote.repository'
import { promotionCatalogToken, type IPromotionCatalog } from '../ports/promotion-catalog.port'
import { createQuoteSchema } from '../schemas/quote-schemas'

/**
 * Command: prices a cart (or an open order) with the catalogue and the shop's rules as they are now,
 * chooses the promotion that gives the most, and pins the result. Nothing is locked or deducted: stock is
 * checked so the till hears about a shortage early, and again when the sale is made.
 */
@injectable()
export class CreateQuoteUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(lineOptionsResolverToken) private readonly lineOptions: ILineOptionsResolver,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(memberRepositoryToken) private readonly members: IMemberRepository,
    @inject(promotionCatalogToken) private readonly catalog: IPromotionCatalog,
    @inject(orderQuoteSourceToken) private readonly orders: IOrderQuoteSource,
    @inject(priceQuoteRepositoryToken) private readonly quotes: IPriceQuoteRepository,
    @inject(TOKENS.Clock) private readonly clock: IClock,
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
    const best = pickBestPromotion(await this.catalog.activePromotions(), {
      subtotalSatang,
      hasMember: member !== null,
      at: now,
      timeZone: shop.timeZone,
    })

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

  /** The same product with the same options is one line; stock is the product's, so checked for the total. */
  private async priceLines(requested: { productId: number; quantity: number; options?: number[] }[], branchId: number) {
    const wanted = new Map<string, { productId: number; optionIds: number[]; quantity: number }>()
    for (const { productId, quantity, options = [] } of requested) {
      const optionIds = [...options].sort((a, b) => a - b)
      const key = `${productId}:${lineKey(optionIds.map((optionId) => ({ optionId })))}`
      const existing = wanted.get(key)
      if (existing) existing.quantity += quantity
      else wanted.set(key, { productId, optionIds, quantity })
    }

    const demand = new Map<number, number>()
    for (const line of wanted.values()) demand.set(line.productId, (demand.get(line.productId) ?? 0) + line.quantity)
    const productsById = new Map<number, ProductEntity>()
    for (const [productId, quantity] of demand) {
      const product = await this.products.findById(productId, branchId)
      if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
      product.assertSellable(quantity)
      productsById.set(productId, product)
    }

    const lines: QuoteLine[] = []
    for (const line of wanted.values()) {
      const product = productsById.get(line.productId)!
      const resolved = await this.lineOptions.resolve(line.productId, line.optionIds)
      lines.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceSatang: product.priceSatang + resolved.priceSatang,
        quantity: line.quantity,
        options: resolved.options,
      })
    }
    return lines
  }
}
