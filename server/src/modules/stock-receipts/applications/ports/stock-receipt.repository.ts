import type { Page } from '../../../../domains/page'
import type { StockReceipt, StockReceiptItem } from '../../../../domains/stock-receipt.domain'
export interface IStockReceiptRepository {
  create(receipt: Omit<StockReceipt, 'id' | 'createdAt' | 'items'>): Promise<StockReceipt>
  appendItems(id: number, items: StockReceiptItem[]): Promise<void>
  findById(id: number, branchId: number): Promise<StockReceipt | null>
  findAll(query: { branchId: number; limit: number; offset: number }): Promise<Page<StockReceipt>>
}
export const stockReceiptRepositoryToken = Symbol('IStockReceiptRepository').toString()
