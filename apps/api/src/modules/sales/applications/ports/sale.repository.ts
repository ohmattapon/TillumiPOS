import type { NewSale, PaymentMethod, SaleEntity, SaleEntityProps } from '../../../../domains/sale.domain'

/** A sale without its lines and payments, for lists. */
export type ISaleHeader = Omit<SaleEntityProps, 'items' | 'payments' | 'voidedById'>

export interface IFindSalesQuery {
  /** Inclusive. */
  from?: Date
  /** Exclusive. */
  to?: Date
  limit?: number
}

/** Raw sums over completed sales in a period; the use case turns them into the summary. */
export interface ISalesTotals {
  saleCount: number
  totalSatang: number
  vatSatang: number
  discountSatang: number
  changeSatang: number
  /** Sum of unit cost x quantity over every line. */
  costSatang: number
  /** What customers handed over per method, before change. Ordered cash, promptpay, card. */
  tendered: { method: PaymentMethod; amountSatang: number }[]
}

export interface ISaleRepository {
  /**
   * The next receipt number of the current business day, e.g. 20261013-00042.
   * Gapless: must be called inside the unit of work that stores the sale, so it rolls back with it.
   */
  nextReceiptNo(): Promise<string>
  create(sale: NewSale, receiptNo: string): Promise<SaleEntity>
  findById(id: number): Promise<SaleEntity | null>
  /** Like findById, but row-locks the sale until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<SaleEntity | null>
  /** Persists the status, void time, reason and user of an already voided entity. */
  saveVoid(sale: SaleEntity): Promise<void>
  /** Newest first. */
  findHeaders(query: IFindSalesQuery): Promise<ISaleHeader[]>
  /** Sums over completed sales created in [from, to). Voided sales are excluded. */
  sumCompleted(period: { from: Date; to: Date }): Promise<ISalesTotals>
}

const saleRepositoryTokenSymbol: unique symbol = Symbol('ISaleRepository')
export const saleRepositoryToken = saleRepositoryTokenSymbol.toString()
