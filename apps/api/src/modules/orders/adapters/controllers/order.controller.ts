import { SetOrderMemberUseCase } from '../../applications/usecases/set-order-member.usecase'
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
import { MergeOrdersUseCase } from '../../applications/usecases/merge-orders.usecase'
import { MoveOrderToTableUseCase } from '../../applications/usecases/move-order-to-table.usecase'
import { OpenOrderUseCase } from '../../applications/usecases/open-order.usecase'
import { PayOrderUseCase } from '../../applications/usecases/pay-order.usecase'
import { RemoveOrderItemUseCase } from '../../applications/usecases/remove-order-item.usecase'
import { RemoveOrderLineUseCase } from '../../applications/usecases/remove-order-line.usecase'
import { RenameOrderUseCase } from '../../applications/usecases/rename-order.usecase'
import { SetOrderItemQuantityUseCase } from '../../applications/usecases/set-order-item-quantity.usecase'
import { SetOrderLineQuantityUseCase } from '../../applications/usecases/set-order-line-quantity.usecase'
import { SplitOrderUseCase } from '../../applications/usecases/split-order.usecase'
import { orderSchemas, type OrderResponse } from './schemas/order.schema'

function toResponse(order: OrderEntity): OrderResponse {
  const { items, ...header } = order.toSnapshot()
  return {
    ...header,
    memberId: order.memberId,
    items: items.map((item) => ({
      ...item,
      // The cost of an option is internal, like the cost of a sale line.
      options: item.options.map(({ costSatang: _cost, ...option }) => option),
      lineTotalSatang: item.unitPriceSatang * item.quantity,
    })),
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
    @inject(SetOrderLineQuantityUseCase) private readonly setLineQuantity: SetOrderLineQuantityUseCase,
    @inject(RemoveOrderLineUseCase) private readonly removeLine: RemoveOrderLineUseCase,
    @inject(MoveOrderToTableUseCase) private readonly moveToTable: MoveOrderToTableUseCase,
    @inject(MergeOrdersUseCase) private readonly mergeOrders: MergeOrdersUseCase,
    @inject(SetOrderMemberUseCase) private readonly setMember: SetOrderMemberUseCase,
    @inject(SplitOrderUseCase) private readonly splitOrder: SplitOrderUseCase,
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
      .patch(
        '/:id/member',
        async ({ params, body, branch }) =>
          toResponse(await this.setMember.execute(params.id, body, (await branch()).id)),
        { params: idParams, body: orderSchemas.member, response: orderSchemas.order, detail: { summary: 'เปลี่ยนสมาชิกของออเดอร์' } },
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
      .patch(
        '/:id/lines/:lineId',
        async ({ params, body, branch }) =>
          toResponse(await this.setLineQuantity.execute(params.id, params.lineId, body, (await branch()).id)),
        {
          params: orderSchemas.lineParams,
          body: orderSchemas.setQuantity,
          response: orderSchemas.order,
          detail: { summary: 'ตั้งจำนวนของบรรทัดในออเดอร์ (ระบุด้วยรหัสบรรทัด)' },
        },
      )
      .delete(
        '/:id/lines/:lineId',
        async ({ params, branch }) =>
          toResponse(await this.removeLine.execute(params.id, params.lineId, (await branch()).id)),
        {
          params: orderSchemas.lineParams,
          response: orderSchemas.order,
          detail: { summary: 'เอาบรรทัดออกจากออเดอร์ (ระบุด้วยรหัสบรรทัด)' },
        },
      )
      .post(
        '/:id/move',
        async ({ params, body, branch }) =>
          toResponse(await this.moveToTable.execute(params.id, body, (await branch()).id)),
        {
          params: idParams,
          body: orderSchemas.move,
          response: orderSchemas.order,
          detail: { summary: 'ย้ายออเดอร์ไปโต๊ะอื่น (หรือไม่มีโต๊ะ)' },
        },
      )
      .post(
        '/:id/merge',
        async ({ params, body, branch }) =>
          toResponse(await this.mergeOrders.execute(params.id, body, (await branch()).id)),
        {
          params: idParams,
          body: orderSchemas.merge,
          response: orderSchemas.order,
          detail: { summary: 'รวมออเดอร์อื่นเข้ากับออเดอร์นี้ (ต้นทางปิดเป็น "รวมแล้ว")' },
        },
      )
      .post(
        '/:id/split',
        async ({ params, body, user, branch }) =>
          toResponse(
            await this.splitOrder.execute(params.id, body, {
              user: { id: user.id, displayName: user.displayName },
              branch: await branch(),
            }),
          ),
        {
          params: idParams,
          body: orderSchemas.split,
          response: orderSchemas.order,
          detail: { summary: 'แยกบางรายการออกเป็นออเดอร์ใหม่ที่โต๊ะเดียวกัน' },
        },
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
