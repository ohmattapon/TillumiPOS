import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { StockMovementEntity } from '../../../../domains/stock-movement.domain'
import { page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { AdjustStockUseCase } from '../../applications/usecases/adjust-stock.usecase'
import { ListStockMovementsUseCase } from '../../applications/usecases/list-stock-movements.usecase'
import { ReceiveStockUseCase } from '../../applications/usecases/receive-stock.usecase'
import { inventorySchemas, type StockMovementResponse } from './schemas/inventory.schema'

const toResponse = (movement: StockMovementEntity): StockMovementResponse => movement.toSnapshot()

@injectable()
export class InventoryElysiaController {
  constructor(
    @inject(ListStockMovementsUseCase) private readonly listStockMovements: ListStockMovementsUseCase,
    @inject(ReceiveStockUseCase) private readonly receiveStock: ReceiveStockUseCase,
    @inject(AdjustStockUseCase) private readonly adjustStock: AdjustStockUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'inventory', prefix: '/inventory', detail: { tags: ['Inventory'] } })
      .use(auth)
      .get(
        '/movements',
        async ({ query, branch }) => {
          const { items, total } = await this.listStockMovements.execute(query, (await branch()).id)
          return { items: items.map(toResponse), total }
        },
        {
          auth: true,
          query: inventorySchemas.movementsQuery,
          response: page(inventorySchemas.movement),
          detail: { summary: 'ประวัติการเคลื่อนไหวสต็อก ล่าสุดก่อน' },
        },
      )
      .post(
        '/receive',
        async ({ body, user, branch }) =>
          toResponse(await this.receiveStock.execute(body, user.id, (await branch()).id)),
        {
          auth: ['owner'],
          body: inventorySchemas.receive,
          response: inventorySchemas.movement,
          detail: { summary: 'รับสินค้าเข้าสต็อก' },
        },
      )
      .post(
        '/adjust',
        async ({ body, user, branch }) =>
          toResponse(await this.adjustStock.execute(body, user.id, (await branch()).id)),
        {
          auth: ['owner'],
          body: inventorySchemas.adjust,
          response: inventorySchemas.movement,
          detail: { summary: 'ปรับยอดสต็อกให้ตรงกับที่นับได้จริง' },
        },
      )
  }
}
