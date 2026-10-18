import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { stockReceiptRepositoryToken, type IStockReceiptRepository } from '../ports/stock-receipt.repository'
import { receiptIdSchema } from '../schemas/stock-receipt.schemas'
/** Query: reads an immutable receipt in the requested branch. */
@injectable()
export class GetStockReceiptUseCase {
  constructor(@inject(stockReceiptRepositoryToken) private readonly receipts: IStockReceiptRepository) {}
  async execute(input: unknown, branchId: number) {
    const { id } = receiptIdSchema.parse(input)
    const receipt = await this.receipts.findById(id, branchId)
    if (!receipt) throw new DomainNotFoundError('ไม่พบใบรับสินค้า', 'STOCK_RECEIPT_NOT_FOUND')
    return receipt
  }
}
