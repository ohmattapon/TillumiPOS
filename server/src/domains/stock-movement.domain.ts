import { DomainError } from './errors/domain-error'

export const STOCK_MOVEMENT_TYPES = ['receive', 'sale', 'void', 'adjust'] as const

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]

/** What is known about a movement before it is stored: the ledger works out the balance. */
export interface NewStockMovement {
  /** Internal receipt linkage, excluded from the existing HTTP movement response. */
  receiptId?: number | null
  /** The branch whose shelves change. */
  branchId: number
  productId: number
  type: StockMovementType
  /** Signed: positive adds stock, negative removes it. */
  quantity: number
  userId: number
  /** Receipt number for sale and void movements. */
  reference?: string | null
  note?: string | null
}

export interface StockMovementEntityProps {
  id: number
  branchId: number
  productId: number
  type: StockMovementType
  quantity: number
  balanceAfter: number
  reference: string | null
  note: string | null
  userId: number
  createdAt: Date
}

const invalid = (message: string) => new DomainError(message, 'INVALID_STOCK_MOVEMENT')

/** Throws unless the movement could be written to the ledger. */
export function assertRecordable(movement: NewStockMovement): void {
  if (!STOCK_MOVEMENT_TYPES.includes(movement.type)) throw invalid('ชนิดของรายการเคลื่อนไหวไม่ถูกต้อง')
  if (!Number.isInteger(movement.quantity) || movement.quantity === 0)
    throw invalid('จำนวนที่เคลื่อนไหวต้องเป็นจำนวนเต็มที่ไม่ใช่ศูนย์')
}

/** One row of the append-only stock ledger. Never changed after it is written. */
export class StockMovementEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly productId: number
  public readonly type: StockMovementType
  public readonly quantity: number
  public readonly balanceAfter: number
  public readonly reference: string | null
  public readonly note: string | null
  public readonly userId: number
  public readonly createdAt: Date

  constructor(props: StockMovementEntityProps) {
    assertRecordable(props)
    if (!Number.isInteger(props.balanceAfter)) throw invalid('ยอดคงเหลือต้องเป็นจำนวนเต็ม')

    this.id = props.id
    this.branchId = props.branchId
    this.productId = props.productId
    this.type = props.type
    this.quantity = props.quantity
    this.balanceAfter = props.balanceAfter
    this.reference = props.reference
    this.note = props.note
    this.userId = props.userId
    this.createdAt = props.createdAt
  }

  toSnapshot(): StockMovementEntityProps {
    return {
      id: this.id,
      branchId: this.branchId,
      productId: this.productId,
      type: this.type,
      quantity: this.quantity,
      balanceAfter: this.balanceAfter,
      reference: this.reference,
      note: this.note,
      userId: this.userId,
      createdAt: this.createdAt,
    }
  }
}
