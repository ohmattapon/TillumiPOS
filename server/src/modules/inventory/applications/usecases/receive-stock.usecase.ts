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
import { receiveStockSchema } from '../schemas/inventory-schemas'
import { packReceiptNote, receiptPieces } from '../../../../domains/stock-receipt.domain'

/** Command. */
@injectable()
export class ReceiveStockUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown, actor: { id: number; displayName: string }, branchId: number) {
    const dto = receiveStockSchema.parse(input)

    return this.unitOfWork.run(async () => {
      // Locked so the balance cannot move between this read and the ledger write.
      const [product] = await this.products.findManyForUpdate([dto.productId], branchId)
      if (!product) throw new DomainNotFoundError('ไม่พบสินค้า')
      if (!product.trackStock) throw new DomainError('สินค้านี้ไม่ได้ตั้งให้นับสต็อก', 'STOCK_NOT_TRACKED')

      const pack = dto.packId === undefined ? null : product.packForReceipt(dto.packId)
      const quantity = pack ? receiptPieces(dto.quantity, pack.size, dto.productId) : dto.quantity
      const note = pack ? packReceiptNote(dto.note ?? null, dto.quantity, pack) : dto.note ?? null

      const movement = await this.ledger.record({
        branchId,
        productId: dto.productId,
        type: 'receive',
        quantity,
        note,
        userId: actor.id,
      })
      await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
        action: 'stock.receive',
        entityType: 'product',
        entityId: String(dto.productId),
        summary: 'รับสินค้าเข้าสต็อก',
        before: { qty: product.stockQty },
        after: { qty: product.stockQty + quantity },
        reason: note,
      }))
      return movement!
    })
  }
}
