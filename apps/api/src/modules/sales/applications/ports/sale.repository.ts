import type { Page } from '../../../../domains/page'
import type { NewSale, PaymentMethod, SaleEntity, SaleEntityProps } from '../../../../domains/sale.domain'

/** A sale without its lines and payments, for lists. */
export type ISaleHeader = Omit<SaleEntityProps, 'items' | 'payments' | 'voidedById'> & { member: NonNullable<NewSale['member']> | null }

export interface IFindSalesQuery {
  /** Only this branch's sales are listed. */
  branchId: number
  /** Inclusive. */
  from?: Date
  /** Exclusive. */
  to?: Date
  status?: 'completed' | 'voided'
  limit?: number
  offset?: number
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
   * The next receipt number of the branch's current business day, e.g. MAIN-20261013-00042.
   * Gapless per branch and day: must be called inside the unit of work that stores the sale,
   * so it rolls back with it.
   */
  nextReceiptNo(branch: { id: number; code: string }): Promise<string>
  create(sale: NewSale, receiptNo: string): Promise<SaleEntity>
  findById(id: number): Promise<SaleEntity | null>
  /** Like findById, but row-locks the sale until the surrounding unit of work ends. */
  findByIdForUpdate(id: number): Promise<SaleEntity | null>
  /** Persists the status, void time, reason and user of an already voided entity. */
  saveVoid(sale: SaleEntity): Promise<void>
  /** One page, newest first, with the total that match. */
  findHeaders(query: IFindSalesQuery): Promise<Page<ISaleHeader>>
  /** Sums over the branch's completed sales created in [from, to). Voided sales are excluded. */
  sumCompleted(period: { from: Date; to: Date; branchId: number }): Promise<ISalesTotals>
}

const saleRepositoryTokenSymbol: unique symbol = Symbol('ISaleRepository')
export const saleRepositoryToken = saleRepositoryTokenSymbol.toString()
