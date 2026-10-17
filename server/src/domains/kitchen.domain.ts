import { DomainConflictError } from './errors/domain-conflict.error'
import { DomainError } from './errors/domain-error'
import { MAX_LINE_QUANTITY } from './order.domain'

export const KITCHEN_TICKET_STATUSES = ['pending', 'done'] as const
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number]

/** One product on a ticket, as it was sent. `quantity` is what went to the kitchen; `voidedQuantity` is what was taken back. */
export interface KitchenLine {
  /** 0 until the line has been stored. */
  id: number
  productId: number
  productName: string
  optionsKey: string
  optionNames: readonly string[]
  note: string | null
  quantity: number
  voidedQuantity: number
}

export type NewKitchenLine = Omit<KitchenLine, 'id' | 'voidedQuantity'>

export interface KitchenTicketProps {
  id: number
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  status: KitchenTicketStatus
  sentById: number
  doneById: number | null
  doneAt: Date | null
  createdAt: Date
  lines: readonly KitchenLine[]
}

export interface NewKitchenTicket {
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  sentById: number
  lines: readonly NewKitchenLine[]
}

const invalidTicket = (message: string, code: string) => new DomainError(message, code)

/** Units that are with the kitchen: sent and not taken back. */
export const activeQuantity = (line: { quantity: number; voidedQuantity: number }) => line.quantity - line.voidedQuantity

export const sentNet = (lines: readonly { quantity: number; voidedQuantity: number }[]) =>
  lines.reduce((total, line) => total + activeQuantity(line), 0)

/** How many units of an order line can still go to the kitchen: the line's quantity less what the kitchen has. */
export const unsentQuantity = (lineQuantity: number, sent: number) => Math.max(0, lineQuantity - sent)

/**
 * Which kitchen lines to take back so that only `keep` units stay with the kitchen. `newestFirst` lists
 * the lines from the latest ticket to the earliest; the latest are taken back first.
 */
export function planVoids(
  newestFirst: readonly { id: number; quantity: number; voidedQuantity: number }[],
  keep: number,
): { lineId: number; take: number }[] {
  let excess = sentNet(newestFirst) - keep
  const plan: { lineId: number; take: number }[] = []
  for (const line of newestFirst) {
    if (excess <= 0) break
    const take = Math.min(activeQuantity(line), excess)
    if (take > 0) {
      plan.push({ lineId: line.id, take })
      excess -= take
    }
  }
  return plan
}

/** A ticket of one station for one round of one order. Lines are only changed by voiding, never by editing. */
export class KitchenTicketEntity {
  public readonly id: number
  public readonly branchId: number
  public readonly orderId: number
  public readonly stationId: number
  public readonly roundNo: number
  public readonly status: KitchenTicketStatus
  public readonly sentById: number
  public readonly doneById: number | null
  public readonly doneAt: Date | null
  public readonly createdAt: Date
  public readonly lines: readonly KitchenLine[]

  constructor(props: KitchenTicketProps) {
    if (!KITCHEN_TICKET_STATUSES.includes(props.status)) throw invalidTicket('สถานะใบสั่งครัวไม่ถูกต้อง', 'INVALID_KITCHEN_TICKET')
    this.id = props.id
    this.branchId = props.branchId
    this.orderId = props.orderId
    this.stationId = props.stationId
    this.roundNo = props.roundNo
    this.status = props.status
    this.sentById = props.sentById
    this.doneById = props.doneById
    this.doneAt = props.doneAt
    this.createdAt = props.createdAt
    this.lines = props.lines
  }

  /** Checks a ticket before it is stored: it needs at least one line, and every quantity is a positive whole number. */
  static validateNew(input: NewKitchenTicket): NewKitchenTicket {
    if (input.lines.length === 0)
      throw new DomainError('ไม่มีรายการที่ยังไม่ได้ส่งครัว', 'KITCHEN_NOTHING_TO_SEND')
    for (const line of input.lines)
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY)
        throw invalidTicket(`จำนวนรายการในใบสั่งต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${MAX_LINE_QUANTITY}`, 'INVALID_KITCHEN_TICKET')
    return input
  }

  markDone(actor: { id: number }, at: Date): KitchenTicketEntity {
    if (this.status !== 'pending') throw new DomainConflictError('ใบสั่งนี้เสร็จแล้ว', 'KITCHEN_TICKET_NOT_PENDING')
    return new KitchenTicketEntity({ ...this.toSnapshot(), status: 'done', doneById: actor.id, doneAt: at })
  }

  /** Every line taken back: the cashier cancelled the whole ticket. It stays on the screen until the kitchen marks it done. */
  get isFullyVoided(): boolean {
    return this.lines.every((line) => activeQuantity(line) === 0)
  }

  toSnapshot(): KitchenTicketProps {
    return {
      id: this.id,
      branchId: this.branchId,
      orderId: this.orderId,
      stationId: this.stationId,
      roundNo: this.roundNo,
      status: this.status,
      sentById: this.sentById,
      doneById: this.doneById,
      doneAt: this.doneAt,
      createdAt: this.createdAt,
      lines: this.lines.map((line) => ({ ...line, optionNames: [...line.optionNames] })),
    }
  }
}
