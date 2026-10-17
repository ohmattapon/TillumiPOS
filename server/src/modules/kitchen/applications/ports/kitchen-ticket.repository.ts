import type { Page } from '../../../../domains/page'
import type { KitchenTicketEntity, NewKitchenTicket } from '../../../../domains/kitchen.domain'

export interface IFindPendingTicketsQuery {
  branchId: number
  stationId: number
  limit?: number
  offset?: number
}

export interface IKitchenTicketRepository {
  /** The round a new ticket of this order at this station gets: one more than the last. */
  nextRoundNo(orderId: number, stationId: number): Promise<number>
  /** Stores a ticket with its lines, as they were sent. */
  create(ticket: NewKitchenTicket): Promise<KitchenTicketEntity>
  /** Row-locks the ticket until the surrounding unit of work ends. Another branch's ticket is not found. */
  findByIdForUpdate(id: number, branchId: number): Promise<KitchenTicketEntity | null>
  /** Writes the status and who finished it. Lines are changed only through voiding. */
  save(ticket: KitchenTicketEntity): Promise<KitchenTicketEntity>
  /** One page of the pending tickets of one station, oldest first, with their lines. */
  findPending(query: IFindPendingTicketsQuery): Promise<Page<KitchenTicketEntity>>
}

const kitchenTicketRepositoryTokenSymbol: unique symbol = Symbol('IKitchenTicketRepository')
export const kitchenTicketRepositoryToken = kitchenTicketRepositoryTokenSymbol.toString()
