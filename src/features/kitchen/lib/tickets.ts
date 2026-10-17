export interface LineCounts {
  quantity: number
  voidedQuantity: number
}

/** Units the kitchen still has to make from one line. */
export const liveUnits = (line: LineCounts) => line.quantity - line.voidedQuantity

/** A line the cashier took back in full: it is crossed out until the ticket is done. */
export const isLineCancelled = (line: LineCounts) => liveUnits(line) === 0

/** A ticket is cancelled as a whole when every one of its lines is. An empty ticket is not. */
export const isTicketCancelled = (lines: readonly LineCounts[]) => lines.length > 0 && lines.every(isLineCancelled)

/** Units of an order line that have not gone to the kitchen yet. */
export const unsentUnits = (orderQuantity: number, sentQuantity: number) => Math.max(0, orderQuantity - sentQuantity)

/** The heading of a ticket: the table it is on, else the order's label, else the order's number. */
export const ticketHeading = (
  ticket: { orderId: number; tableName: string | null; orderLabel: string | null },
  fallback: (orderId: number) => string,
) => ticket.tableName ?? ticket.orderLabel ?? fallback(ticket.orderId)
