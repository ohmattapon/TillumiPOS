import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { DomainNotFoundError } from './errors/domain-not-found.error'
import { lineKey, type LineOption } from './modifier.domain'

export const ORDER_STATUSES = ['open', 'paid', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** One line of an order. Name, SKU and price are what was quoted when it was ordered. */
export interface OrderItem {
  /** Id of the stored line; 0 until the order has been stored. */
  lineId: number
  productId: number
  productName: string
  sku: string
  /** The product's price plus the options chosen: what is charged for one unit of this line. */
  unitPriceSatang: number
  quantity: number
  options: readonly LineOption[]
}

/** What is needed to put a product on an order: the product as it is now. */
export type OrderedProduct = Pick<OrderItem, 'productId' | 'productName' | 'sku' | 'unitPriceSatang'>

export interface NewOrder {
  branchId: number
  label: string | null
  openedById: number
  openedByName: string
  items: OrderItem[]
}

export interface OrderEntityProps extends NewOrder {
  /** 0 until the order has been stored. */
  id: number
  status: OrderStatus
  saleId: number | null
  cancelReason: string | null
  cancelledById: number | null
  createdAt: Date
  updatedAt: Date
}

export const MAX_ORDER_LINES = 100
export const MAX_LINE_QUANTITY = 9999
const MAX_LABEL_LENGTH = 100
const MAX_REASON_LENGTH = 500

const invalid = (message: string) => new DomainError(message, 'INVALID_ORDER')

function assertLabel(label: string | null) {
  if (label !== null && (label.length < 1 || label.length > MAX_LABEL_LENGTH))
    throw invalid(`ป้ายชื่อออเดอร์ต้องยาว 1 ถึง ${MAX_LABEL_LENGTH} ตัวอักษร`)
}

function assertQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY)
    throw invalid(`จำนวนสินค้าต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_LINE_QUANTITY}`)
}

/** The same product with the same options is the same line. */
const identity = (item: OrderItem) => `${item.productId}:${lineKey(item.options)}`

/** The lines of an order, with repeated products and options merged into the first line of each. */
function mergeLines(items: readonly OrderItem[]): OrderItem[] {
  const merged = new Map<string, OrderItem>()
  for (const item of items) {
    assertQuantity(item.quantity)
    const key = identity(item)
    const existing = merged.get(key)
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : { ...item })
  }
  const lines = [...merged.values()]
  lines.forEach((line) => assertQuantity(line.quantity))
  if (lines.length > MAX_ORDER_LINES) throw invalid(`ออเดอร์มีรายการได้ไม่เกิน ${MAX_ORDER_LINES} บรรทัด`)
  return lines
}

const plainLineOf = (productId: number) => (item: OrderItem) => item.productId === productId && item.options.length === 0
const lineWithId = (lineId: number) => (item: OrderItem) => item.lineId === lineId

/**
 * A bill that is still being built. It is edited while open and closed once: paid (it then
 * refers to its sale) or cancelled. Every change returns a new entity.
 */
export class OrderEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly label: string | null
  public readonly status: OrderStatus
  public readonly openedById: number
  public readonly openedByName: string
  public readonly saleId: number | null
  public readonly cancelReason: string | null
  public readonly cancelledById: number | null
  public readonly createdAt: Date
  public readonly updatedAt: Date
  public readonly items: readonly OrderItem[]

  constructor(props: OrderEntityProps) {
    if (!ORDER_STATUSES.includes(props.status)) throw invalid('สถานะของออเดอร์ไม่ถูกต้อง')
    assertLabel(props.label)
    if (props.status === 'paid' && props.saleId === null) throw invalid('ออเดอร์ที่ชำระแล้วต้องมีบิลขาย')

    this.id = props.id
    this.branchId = props.branchId
    this.label = props.label
    this.status = props.status
    this.openedById = props.openedById
    this.openedByName = props.openedByName
    this.saleId = props.saleId
    this.cancelReason = props.cancelReason
    this.cancelledById = props.cancelledById
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
    this.items = props.items
  }

  /** Validates and normalizes a new order: blank label means none, repeated products are merged. */
  static open(input: NewOrder): NewOrder {
    const label = input.label?.trim() || null
    assertLabel(label)
    return { ...input, label, items: mergeLines(input.items) }
  }

  get subtotalSatang(): number {
    return this.items.reduce((total, item) => total + item.unitPriceSatang * item.quantity, 0)
  }

  get itemCount(): number {
    return this.items.reduce((total, item) => total + item.quantity, 0)
  }

  /**
   * Puts a product on the order. The same product with the same options gains the quantity and keeps
   * the price it was quoted. `product.unitPriceSatang` is the unit price including the options.
   */
  addItem(product: OrderedProduct, quantity: number, options: readonly LineOption[] = []): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    return this.change({ items: mergeLines([...this.items, { ...product, lineId: 0, options, quantity }]) })
  }

  /** Sets how many of a product, without options, are ordered. */
  setQuantity(productId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(plainLineOf(productId), quantity)
  }

  /** Sets how many of one line are ordered, whatever options it has. */
  setLineQuantity(lineId: number, quantity: number): OrderEntity {
    return this.setQuantityOf(lineWithId(lineId), quantity)
  }

  /** Takes the line of a product without options off the order. */
  removeItem(productId: number): OrderEntity {
    return this.removeWhere(plainLineOf(productId))
  }

  removeLine(lineId: number): OrderEntity {
    return this.removeWhere(lineWithId(lineId))
  }

  /** A blank label clears it. */
  rename(label: string | null): OrderEntity {
    this.assertOpen()
    const next = label?.trim() || null
    assertLabel(next)
    return this.change({ label: next })
  }

  cancel(reason: string, cancelledById: number): OrderEntity {
    this.assertOpen()
    if (reason.length < 1 || reason.length > MAX_REASON_LENGTH)
      throw invalid(`เหตุผลที่ยกเลิกต้องยาว 1 ถึง ${MAX_REASON_LENGTH} ตัวอักษร`)
    return this.change({ status: 'cancelled', cancelReason: reason, cancelledById })
  }

  /** Closes the order as paid by the given sale. An empty order cannot be paid. */
  markPaid(saleId: number): OrderEntity {
    this.assertPayable()
    return this.change({ status: 'paid', saleId })
  }

  /** Throws unless the order is open and has something on it, which is what paying needs. */
  assertPayable(): void {
    this.assertOpen()
    if (this.items.length === 0) throw new DomainError('ออเดอร์ยังไม่มีรายการ', 'ORDER_EMPTY')
  }

  toSnapshot(): OrderEntityProps {
    return {
      id: this.id,
      branchId: this.branchId,
      label: this.label,
      status: this.status,
      openedById: this.openedById,
      openedByName: this.openedByName,
      saleId: this.saleId,
      cancelReason: this.cancelReason,
      cancelledById: this.cancelledById,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      items: this.items.map((item) => ({ ...item })),
    }
  }

  private assertOpen(): void {
    if (this.status !== 'open') throw new DomainConflictError('ออเดอร์นี้ปิดแล้ว แก้ไขไม่ได้', 'ORDER_NOT_OPEN')
  }

  private setQuantityOf(match: (item: OrderItem) => boolean, quantity: number): OrderEntity {
    this.assertOpen()
    assertQuantity(quantity)
    this.requireItem(match)
    return this.change({ items: this.items.map((item) => (match(item) ? { ...item, quantity } : item)) })
  }

  private removeWhere(match: (item: OrderItem) => boolean): OrderEntity {
    this.assertOpen()
    this.requireItem(match)
    return this.change({ items: this.items.filter((item) => !match(item)) })
  }

  private requireItem(match: (item: OrderItem) => boolean): void {
    if (!this.items.some(match)) throw new DomainNotFoundError('ไม่พบสินค้านี้ในออเดอร์', 'ORDER_ITEM_NOT_FOUND')
  }

  private change(changes: Partial<OrderEntityProps>): OrderEntity {
    return new OrderEntity({ ...this.toSnapshot(), ...changes })
  }
}
