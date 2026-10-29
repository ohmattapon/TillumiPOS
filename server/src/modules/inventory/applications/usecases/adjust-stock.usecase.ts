import type { ProductEntity } from '../../../../domains/product.domain'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { stockLedgerToken } from '../ports/stock-ledger.port'
import type { IStockLedger } from '../ports/stock-ledger.port'
import { adjustStockSchema } from '../schemas/inventory-schemas'

/** Command: sets the balance to what was physically counted, recording the signed difference. */
@injectable()
export class AdjustStockUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown, actor: { id: number; displayName: string }, branchId: number) {
    const dto = adjustStockSchema.parse(input)

    return this.unitOfWork.run(async () => {
      const product = await this.lockCountedProduct(dto.productId, branchId)

      const difference = dto.countedQty - product.stockQty
      if (difference === 0) throw new DomainError('ยอดที่นับได้ตรงกับยอดในระบบอยู่แล้ว', 'NO_CHANGE')

      const movement = await this.ledger.record({
        branchId,
        productId: dto.productId,
        type: 'adjust',
        quantity: difference,
        note: dto.note ?? null,
        userId: actor.id,
      })
      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'stock.adjust',
        entityType: 'product',
        entityId: String(dto.productId),
        summary: 'ปรับยอดสต็อก',
        before: { qty: product.stockQty },
        after: { qty: dto.countedQty },
        reason: dto.note,
      }))
      return movement!
    })
  }

  /** Locked so the balance cannot move between this read and the ledger write. */
  private async lockCountedProduct(productId: number, branchId: number): Promise<ProductEntity> {
    const [product] = await this.products.findManyForUpdate([productId], branchId)
    if (!product) throw new DomainNotFoundError('ไม่พบสินค้า')
    if (!product.trackStock) throw new DomainError('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')
    return product
  }
}
