import { inject, injectable } from 'tsyringe'
import type { KitchenTicketEntity } from '../../../../domains/kitchen.domain'
import type { Page } from '../../../../domains/page'
import { tableRepositoryToken } from '../../../tables/applications/ports/table.repository'
import type { ITableRepository } from '../../../tables/applications/ports/table.repository'
import { kitchenOrderRefsToken } from '../ports/kitchen-order-refs.port'
import type { IKitchenOrderRefs } from '../ports/kitchen-order-refs.port'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'
import { kitchenBoardQuerySchema } from '../schemas/kitchen-schemas'

export interface KitchenBoardTicket {
  ticket: KitchenTicketEntity
  orderLabel: string | null
  /** The table the order is on now, which may differ from the table when the ticket was sent. */
  tableName: string | null
}

/** Query: the open tickets of one station, with where they belong. */
@injectable()
export class ListKitchenTicketsUseCase {
  constructor(
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(kitchenOrderRefsToken) private readonly refs: IKitchenOrderRefs,
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
  ) {}

  async execute(input: unknown, branchId: number): Promise<Page<KitchenBoardTicket>> {
    const query = kitchenBoardQuerySchema.parse(input)
    const page = await this.tickets.findPending({ branchId, ...query })

    const refs = await this.refs.refsOf([...new Set(page.items.map((ticket) => ticket.orderId))])
    const tableNames = new Map((await this.tables.findAll(branchId)).map((table) => [table.id, table.name]))

    return {
      items: page.items.map((ticket) => {
        const ref = refs.get(ticket.orderId)
        return {
          ticket,
          orderLabel: ref?.label ?? null,
          tableName: ref?.tableId != null ? (tableNames.get(ref.tableId) ?? null) : null,
        }
      }),
      total: page.total,
    }
  }
}
