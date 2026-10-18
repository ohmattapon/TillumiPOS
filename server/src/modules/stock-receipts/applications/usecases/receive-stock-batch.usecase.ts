import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { invalidReceiptItems, normalizeReceiptItems, POSTGRES_INT_MAX, type StockReceipt } from '../../../../domains/stock-receipt.domain'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { stockLedgerToken, type IStockLedger } from '../../../inventory/applications/ports/stock-ledger.port'
import { productRepositoryToken, type IProductRepository } from '../../../products/applications/ports/product.repository'
import { CommandIdempotency } from '../../../shared/applications/command-idempotency'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { stockReceiptRepositoryToken, type IStockReceiptRepository } from '../ports/stock-receipt.repository'
import { receiveStockBatchSchema } from '../schemas/stock-receipt.schemas'

/** Command: receives an entire delivery atomically and replays successful retries. */
@injectable()
export class ReceiveStockBatchUseCase {
  constructor(
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(stockLedgerToken) private readonly ledger: IStockLedger,
    @inject(stockReceiptRepositoryToken) private readonly receipts: IStockReceiptRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
    @inject(CommandIdempotency) private readonly idempotency: CommandIdempotency,
  ) {}
  async execute(input: unknown, actor: Actor & { id: number; displayName: string }, branchId: number, key: string): Promise<StockReceipt> {
    const dto = receiveStockBatchSchema.parse(input)
    requirePermission(actor, 'inventory.receive')
    const items = normalizeReceiptItems(dto.items)
    const canonical = { items, note: dto.note ?? null }
    return this.unitOfWork.run(() => this.idempotency.execute(
      { branchId, actorId: actor.id, action: 'stock.receive_batch', key }, canonical,
      async () => {
        const products = await this.products.findManyForUpdate(items.map(item => item.productId), branchId)
        const byId = new Map(products.map(product => [product.id, product]))
        const invalid = items.filter(item => {
          const product = byId.get(item.productId)
          return !product || !product.trackStock || product.stockQty + item.quantity > POSTGRES_INT_MAX
        })
        if (invalid.length) throw invalidReceiptItems(invalid.map(item => item.productId))
        const receipt = await this.receipts.create({ branchId, receivedById: actor.id, receivedByName: actor.displayName, note: canonical.note })
        for (const item of items) {
          const product = byId.get(item.productId)!
          const movement = await this.ledger.record({ ...item, branchId, type: 'receive', userId: actor.id, note: canonical.note, receiptId: receipt.id })
          if (!movement) throw invalidReceiptItems([item.productId])
          receipt.items.push({ ...item, sku: product.sku, name: product.name, balanceAfter: movement.balanceAfter })
        }
        await this.receipts.appendItems(receipt.id, receipt.items)
        await this.audit.record({ id: actor.id, name: actor.displayName }, branchId, buildAuditEntry({
          action: 'stock.receive_batch', entityType: 'stock_receipt', entityId: String(receipt.id), summary: 'รับสินค้าเข้าสต็อกหลายรายการ',
          after: { items: receipt.items }, reason: dto.note,
        }))
        return receipt
      }, result => result, async result => result as StockReceipt,
    ))
  }
}
