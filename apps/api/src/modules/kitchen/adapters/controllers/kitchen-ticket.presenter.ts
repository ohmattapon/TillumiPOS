import type { KitchenTicketEntity } from '../../../../domains/kitchen.domain'
import type { KitchenBoardTicket } from '../../applications/usecases/list-kitchen-tickets.usecase'

export interface KitchenTicketResponse {
  id: number
  branchId: number
  orderId: number
  stationId: number
  roundNo: number
  status: 'pending' | 'done'
  sentById: number
  doneById: number | null
  doneAt: Date | null
  createdAt: Date
  lines: {
    id: number
    productId: number
    productName: string
    optionNames: string[]
    note: string | null
    quantity: number
    voidedQuantity: number
  }[]
}

/** A ticket as the API sends it: the option costs and the internal snapshot stay on the server. */
export const toTicketResponse = (ticket: KitchenTicketEntity): KitchenTicketResponse => {
  const { lines, ...header } = ticket.toSnapshot()
  return {
    ...header,
    lines: lines.map(({ optionsKey: _key, ...line }) => ({ ...line, optionNames: [...line.optionNames] })),
  }
}

export const toBoardTicketResponse = (board: KitchenBoardTicket) => ({
  ...toTicketResponse(board.ticket),
  orderLabel: board.orderLabel,
  tableName: board.tableName,
})
