import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { SaleEntity } from '../../../../domains/sale.domain'
import { stockLedgerToken } from '../../../inventory/applications/ports/stock-ledger.port'
import type { IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import { shopSettingsRepositoryToken } from '../../../settings/applications/ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { saleRepositoryToken } from '../ports/sale.repository'
import type { ISaleRepository } from '../ports/sale.repository'
import { completeSaleSchema } from '../schemas/sale-schemas'

/** Command: records a sale, deducts stock and issues the receipt number, all or nothing. */
@injectable()
export class CompleteSaleUseCase {
  constructor(
    @inject(saleRepositoryToken) private readonly sales: ISaleRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
  ) {}

  async execute(input: unknown, cashier: { id: number; displayName: string }, branch: { id: number; code: string }) {
    const dto = completeSaleSchema.parse(input)

    // Merge repeated products; a Map keeps the order they were added to the cart.
    const quantities = new Map<number, number>()
    for (const item of dto.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)

    return this.unitOfWork.run(async () => {
      // Read inside the unit of work, so the sale is priced with the settings in force when it is recorded.
      const shop = await this.settings.get()

      // Locked until the sale commits, so two tills cannot sell the same last unit.
      const locked = await this.products.findManyForUpdate([...quantities.keys()], branch.id)
      const productsById = new Map(locked.map((product) => [product.id, product]))

      const lines = [...quantities].map(([productId, quantity]) => {
        const product = productsById.get(productId)
        if (!product) throw new DomainError('ไม่พบสินค้ารหัส ' + productId, 'PRODUCT_NOT_FOUND', { productId })
        product.assertSellable(quantity)
        return { product, quantity }
      })

      const priced = SaleEntity.complete({
        lines,
        discountSatang: dto.discountSatang ?? 0,
        payments: dto.payments,
        vatMode: shop.vatMode,
        vatRateBp: shop.vatRateBp,
        branchId: branch.id,
        cashier,
      })
      // Taken only after every rule has passed; it still rolls back with the sale if a later step fails.
      const sale = await this.sales.create(priced, await this.sales.nextReceiptNo(branch))

      for (const item of sale.items)
        await this.ledger.record({
          branchId: branch.id,
          productId: item.productId,
          type: 'sale',
          quantity: -item.quantity,
          reference: sale.receiptNo,
          userId: cashier.id,
        })

      return sale
    })
  }
}
