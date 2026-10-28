import { inject, injectable } from 'tsyringe'
import { stockReceiptRepositoryToken, type IStockReceiptRepository } from '../ports/stock-receipt.repository'
import { receiptListSchema } from '../schemas/stock-receipt.schemas'
/** Query: lists branch-scoped immutable receipt documents. */
@injectable()
export class ListStockReceiptsUseCase {
  constructor(@inject(stockReceiptRepositoryToken) private readonly receipts: IStockReceiptRepository) {}
  async execute(input: unknown, branchId: number) {
    const dto = receiptListSchema.parse(input)
    return this.receipts.findAll({ ...dto, branchId })
  }
}
