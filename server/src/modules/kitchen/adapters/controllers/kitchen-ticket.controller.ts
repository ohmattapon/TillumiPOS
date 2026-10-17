import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { SendOrderToKitchenUseCase } from '../../applications/usecases/send-order-to-kitchen.usecase'
import { ListKitchenTicketsUseCase } from '../../applications/usecases/list-kitchen-tickets.usecase'
import { MarkKitchenTicketDoneUseCase } from '../../applications/usecases/mark-kitchen-ticket-done.usecase'
import { kitchenSchemas } from './schemas/kitchen.schema'
import { toBoardTicketResponse, toTicketResponse } from './kitchen-ticket.presenter'

/** The kitchen board and the till's "send to kitchen". Every signed-in user works in the branch of the request. */
@injectable()
export class KitchenTicketElysiaController {
  constructor(
    @inject(ListKitchenTicketsUseCase) private readonly listTickets: ListKitchenTicketsUseCase,
    @inject(MarkKitchenTicketDoneUseCase) private readonly markDone: MarkKitchenTicketDoneUseCase,
    @inject(SendOrderToKitchenUseCase) private readonly sendToKitchen: SendOrderToKitchenUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'kitchen.tickets', detail: { tags: ['Kitchen'] } })
      .use(auth)
      .guard({ auth: true })
      .get(
        '/kitchen/tickets',
        async ({ query, branch }) => {
          const { items, total } = await this.listTickets.execute(query, (await branch()).id)
          return { items: items.map(toBoardTicketResponse), total }
        },
        {
          query: kitchenSchemas.boardQuery,
          response: page(kitchenSchemas.boardTicket),
          detail: { summary: 'ใบสั่งครัวที่ยังค้างของสถานี' },
        },
      )
      .post(
        '/kitchen/tickets/:id/done',
        async ({ params, user, branch }) =>
          toTicketResponse(await this.markDone.execute(params.id, { userId: user.id, branchId: (await branch()).id })),
        {
          params: idParams,
          response: kitchenSchemas.ticket,
          detail: { summary: 'ทำใบสั่งครัวเสร็จ' },
        },
      )
      .post(
        '/orders/:id/kitchen-send',
        async ({ params, user, branch }) => {
          const items = await this.sendToKitchen.execute(params.id, { userId: user.id, branchId: (await branch()).id })
          const responses = items.map(toTicketResponse)
          return { items: responses, total: responses.length }
        },
        {
          params: idParams,
          response: page(kitchenSchemas.ticket),
          detail: { summary: 'ส่งรายการที่ยังไม่เคยส่งของออเดอร์ไปครัว (หนึ่งใบต่อสถานี)' },
        },
      )
  }
}
