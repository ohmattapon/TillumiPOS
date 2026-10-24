import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { invalidReceiptItems, normalizeReceiptItems, packReceiptNote, POSTGRES_INT_MAX, receiptPieces, type StockReceipt } from '../../../../domains/stock-receipt.domain'
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
        // Packs resolve only for products that exist, so an unknown product is still reported alongside the rest.
        const lines = items.map(item => {
          const product = byId.get(item.productId)
          if (!product || item.packId === undefined) return { productId: item.productId, quantity: item.quantity, note: canonical.note }
          const pack = product.packForReceipt(item.packId)
          return {
            productId: item.productId,
            quantity: receiptPieces(item.quantity, pack.size, item.productId),
            note: packReceiptNote(canonical.note, item.quantity, pack),
          }
        })
        const piecesByProduct = new Map<number, number>()
        for (const line of lines) piecesByProduct.set(line.productId, (piecesByProduct.get(line.productId) ?? 0) + line.quantity)
        const invalid = [...piecesByProduct].filter(([productId, pieces]) => {
          const product = byId.get(productId)
          return !product || !product.trackStock || product.stockQty + pieces > POSTGRES_INT_MAX
        })
        if (invalid.length) throw invalidReceiptItems(invalid.map(([productId]) => productId))
        const receipt = await this.receipts.create({ branchId, receivedById: actor.id, receivedByName: actor.displayName, note: canonical.note })
        for (const line of lines) {
          const product = byId.get(line.productId)!
          const movement = await this.ledger.record({ ...line, branchId, type: 'receive', userId: actor.id, receiptId: receipt.id })
          if (!movement) throw invalidReceiptItems([line.productId])
          receipt.items.push({ productId: line.productId, quantity: line.quantity, sku: product.sku, name: product.name, balanceAfter: movement.balanceAfter })
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
