import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { stockLedgerToken } from '../ports/stock-ledger.port'
import type { IStockLedger } from '../ports/stock-ledger.port'
import { receiveStockSchema } from '../schemas/inventory-schemas'

/** Command. */
@injectable()
export class ReceiveStockUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: unknown, userId: number) {
    const dto = receiveStockSchema.parse(input)

    return this.unitOfWork.run(async () => {
      // Locked so the balance cannot move between this read and the ledger write.
      const [product] = await this.products.findManyForUpdate([dto.productId])
      if (!product) throw new DomainNotFoundError('ไม่พบสินค้า')
      if (!product.trackStock) throw new DomainError('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')

      const movement = await this.ledger.record({
        productId: dto.productId,
        type: 'receive',
        quantity: dto.quantity,
        note: dto.note ?? null,
        userId,
      })
      return movement!
    })
  }
}
