import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { OrderEntity } from '../../../../domains/order.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { toSaleResponse } from '../../../sales/adapters/controllers/sale.presenter'
import { saleSchemas } from '../../../sales/adapters/controllers/schemas/sale.schema'
import { AddOrderItemUseCase } from '../../applications/usecases/add-order-item.usecase'
import { CancelOrderUseCase } from '../../applications/usecases/cancel-order.usecase'
import { GetOrderUseCase } from '../../applications/usecases/get-order.usecase'
import { ListOrdersUseCase } from '../../applications/usecases/list-orders.usecase'
import { OpenOrderUseCase } from '../../applications/usecases/open-order.usecase'
import { PayOrderUseCase } from '../../applications/usecases/pay-order.usecase'
import { RemoveOrderItemUseCase } from '../../applications/usecases/remove-order-item.usecase'
import { RenameOrderUseCase } from '../../applications/usecases/rename-order.usecase'
import { SetOrderItemQuantityUseCase } from '../../applications/usecases/set-order-item-quantity.usecase'
import { orderSchemas, type OrderResponse } from './schemas/order.schema'

function toResponse(order: OrderEntity): OrderResponse {
  const { items, ...header } = order.toSnapshot()
  return {
    ...header,
    items: items.map((item) => ({ ...item, lineTotalSatang: item.unitPriceSatang * item.quantity })),
    itemCount: order.itemCount,
    subtotalSatang: order.subtotalSatang,
  }
}

@injectable()
export class OrderElysiaController {
  constructor(
    @inject(ListOrdersUseCase) private readonly listOrders: ListOrdersUseCase,
    @inject(GetOrderUseCase) private readonly getOrder: GetOrderUseCase,
    @inject(OpenOrderUseCase) private readonly openOrder: OpenOrderUseCase,
    @inject(RenameOrderUseCase) private readonly renameOrder: RenameOrderUseCase,
    @inject(AddOrderItemUseCase) private readonly addItem: AddOrderItemUseCase,
    @inject(SetOrderItemQuantityUseCase) private readonly setQuantity: SetOrderItemQuantityUseCase,
    @inject(RemoveOrderItemUseCase) private readonly removeItem: RemoveOrderItemUseCase,
    @inject(CancelOrderUseCase) private readonly cancelOrder: CancelOrderUseCase,
    @inject(PayOrderUseCase) private readonly payOrder: PayOrderUseCase,
  ) {}

  getRoutes() {
    // Every route works inside the branch of the request (see the auth plugin) and is open to any signed-in user.
    return new Elysia({ name: 'orders', prefix: '/orders', detail: { tags: ['Orders'] } })
      .use(auth)
      .guard({ auth: true })
      .get(
        '/',
        async ({ query, branch }) => {
          const { items, total } = await this.listOrders.execute(query, (await branch()).id)
          return { items: items.map(toResponse), total }
        },
        {
          query: orderSchemas.listQuery,
          response: page(orderSchemas.order),
          detail: { summary: 'ออเดอร์ของสาขา (ค่าเริ่มต้น: ที่ยังเปิดอยู่)' },
        },
      )
      .post(
        '/',
        async ({ body, user, branch }) =>
          toResponse(await this.openOrder.execute(body, { user: { id: user.id, displayName: user.displayName }, branch: await branch() })),
        { body: orderSchemas.open, response: orderSchemas.order, detail: { summary: 'เปิดออเดอร์ใหม่' } },
      )
      .get(
        '/:id',
        async ({ params, branch }) => toResponse(await this.getOrder.execute(params.id, (await branch()).id)),
        { params: idParams, response: orderSchemas.order, detail: { summary: 'รายละเอียดออเดอร์' } },
      )
      .patch(
        '/:id',
        async ({ params, body, branch }) =>
          toResponse(await this.renameOrder.execute(params.id, body, (await branch()).id)),
        { params: idParams, body: orderSchemas.update, response: orderSchemas.order, detail: { summary: 'เปลี่ยนป้ายชื่อออเดอร์' } },
      )
      .post(
        '/:id/items',
        async ({ params, body, branch }) =>
          toResponse(await this.addItem.execute(params.id, body, (await branch()).id)),
        {
          params: idParams,
          body: orderSchemas.addItem,
          response: orderSchemas.order,
          detail: { summary: 'เพิ่มสินค้าลงออเดอร์ (รวมกับบรรทัดเดิมถ้ามี)' },
        },
      )
      .patch(
        '/:id/items/:productId',
        async ({ params, body, branch }) =>
          toResponse(await this.setQuantity.execute(params.id, params.productId, body, (await branch()).id)),
        {
          params: orderSchemas.itemParams,
          body: orderSchemas.setQuantity,
          response: orderSchemas.order,
          detail: { summary: 'ตั้งจำนวนสินค้าในออเดอร์' },
        },
      )
      .delete(
        '/:id/items/:productId',
        async ({ params, branch }) =>
          toResponse(await this.removeItem.execute(params.id, params.productId, (await branch()).id)),
        { params: orderSchemas.itemParams, response: orderSchemas.order, detail: { summary: 'เอาสินค้าออกจากออเดอร์' } },
      )
      .post(
        '/:id/cancel',
        async ({ params, body, user, branch }) =>
          toResponse(
            await this.cancelOrder.execute(params.id, body, {
              user: { id: user.id, displayName: user.displayName },
              branch: await branch(),
            }),
          ),
        { params: idParams, body: orderSchemas.cancel, response: orderSchemas.order, detail: { summary: 'ยกเลิกออเดอร์' } },
      )
      .post(
        '/:id/pay',
        async ({ params, body, user, branch }) =>
          toSaleResponse(
            await this.payOrder.execute(params.id, body, {
              user: { id: user.id, displayName: user.displayName },
              branch: await branch(),
            }),
          ),
        {
          params: idParams,
          body: orderSchemas.pay,
          response: saleSchemas.sale,
          detail: { summary: 'ชำระออเดอร์: ออกบิลขาย ตัดสต็อก และปิดออเดอร์' },
        },
      )
  }
}
