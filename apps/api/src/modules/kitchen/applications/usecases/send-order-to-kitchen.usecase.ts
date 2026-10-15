import { inject, injectable } from 'tsyringe'
import { DomainError } from '../../../../domains/errors/domain-error'
import { KitchenTicketEntity, unsentQuantity, type NewKitchenLine } from '../../../../domains/kitchen.domain'
import { lineKey } from '../../../../domains/modifier.domain'
import { lineIdentity } from '../../../../domains/order.domain'
import { orderRepositoryToken } from '../../../orders/applications/ports/order.repository'
import type { IOrderRepository } from '../../../orders/applications/ports/order.repository'
import { kitchenTicketsToken } from '../../../orders/applications/ports/kitchen-tickets.port'
import type { IKitchenTickets } from '../../../orders/applications/ports/kitchen-tickets.port'
import { inBranch } from '../../../orders/applications/services/order-access'
import { productRepositoryToken } from '../../../products/applications/ports/product.repository'
import type { IProductRepository } from '../../../products/applications/ports/product.repository'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'
import { kitchenTicketRepositoryToken } from '../ports/kitchen-ticket.repository'
import type { IKitchenTicketRepository } from '../ports/kitchen-ticket.repository'

/**
 * Command: sends the lines of an open order that have not gone to the kitchen yet, as one ticket per
 * station for this round. The order row is locked first, so two sends of the same order cannot both
 * count the same units. Stock is not touched: sending to the kitchen is not a sale.
 */
@injectable()
export class SendOrderToKitchenUseCase {
  constructor(
    @inject(orderRepositoryToken) private readonly orders: IOrderRepository,
    @inject(productRepositoryToken) private readonly products: IProductRepository,
    @inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository,
    @inject(kitchenTicketRepositoryToken) private readonly tickets: IKitchenTicketRepository,
    @inject(kitchenTicketsToken) private readonly kitchen: IKitchenTickets,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(orderId: number, actor: { userId: number; branchId: number }): Promise<KitchenTicketEntity[]> {
    return this.unitOfWork.run(async () => {
      const order = inBranch(await this.orders.findByIdForUpdate(orderId), actor.branchId)
      order.assertOpen()

      const sent = (await this.kitchen.sentByLine([order.id])).get(order.id) ?? new Map<string, number>()
      const stations = await this.routing.stationsByCategory()
      const byStation = new Map<number, NewKitchenLine[]>()

      for (const item of order.items) {
        const quantity = unsentQuantity(item.quantity, sent.get(lineIdentity(item.productId, item.options)) ?? 0)
        if (quantity === 0) continue
        const product = await this.products.findById(item.productId, actor.branchId)
        const stationId = product?.categoryId == null ? undefined : stations.get(product.categoryId)
        if (stationId === undefined) continue
        const lines = byStation.get(stationId) ?? []
        lines.push({
          productId: item.productId,
          productName: item.productName,
          optionsKey: lineKey(item.options),
          optionNames: item.options.map((option) => option.name),
          note: item.note,
          quantity,
        })
        byStation.set(stationId, lines)
      }

      if (byStation.size === 0)
        throw new DomainError('ไม่มีรายการที่ส่งครัวได้ (ยังไม่ได้ผูกหมวดกับสถานี หรือส่งไปหมดแล้ว)', 'KITCHEN_NOTHING_TO_SEND')

      const created: KitchenTicketEntity[] = []
      for (const [stationId, lines] of byStation) {
        const roundNo = await this.tickets.nextRoundNo(order.id, stationId)
        created.push(
          await this.tickets.create(
            KitchenTicketEntity.validateNew({
              branchId: actor.branchId,
              orderId: order.id,
              stationId,
              roundNo,
              sentById: actor.userId,
              lines,
            }),
          ),
        )
      }
      return created
    })
  }
}
