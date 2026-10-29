import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idempotencyHeaders, idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { GetStockReceiptUseCase } from '../../applications/usecases/get-stock-receipt.usecase'
import { ListStockReceiptsUseCase } from '../../applications/usecases/list-stock-receipts.usecase'
import { ReceiveStockBatchUseCase } from '../../applications/usecases/receive-stock-batch.usecase'

const quantity = t.Integer({ minimum: 1, maximum: 2147483647 })
const item = t.Object({ productId: quantity, quantity })
// The request may count packs; the stored receipt always keeps pieces.
const receivedItem = t.Object({ productId: quantity, quantity, packId: t.Optional(t.Integer({ minimum: 1 })) })
const receipt = t.Object({
  id: t.Integer(), branchId: t.Integer(), receivedById: t.Integer(), receivedByName: t.String(),
  createdAt: t.String(), note: t.Nullable(t.String()),
  items: t.Array(t.Object({ ...item.properties, sku: t.String(), name: t.String(), balanceAfter: t.Integer() })),
})
export type StockReceiptResponse = typeof receipt.static

@injectable()
export class StockReceiptElysiaController {
  constructor(
    @inject(ReceiveStockBatchUseCase) private readonly receive: ReceiveStockBatchUseCase,
    @inject(GetStockReceiptUseCase) private readonly get: GetStockReceiptUseCase,
    @inject(ListStockReceiptsUseCase) private readonly list: ListStockReceiptsUseCase,
  ) {}
  getRoutes() {
    return new Elysia({ name: 'stock-receipts', prefix: '/inventory/receipts', detail: { tags: ['Inventory'] } })
      .use(auth)
      .post('/', async ({ body, user, branch, headers }) => this.receive.execute(body, user, (await branch()).id, headers['idempotency-key']), {
        auth: { can: 'inventory.receive' }, headers: idempotencyHeaders,
        body: t.Object({ items: t.Array(receivedItem, { minItems: 1, maxItems: 100 }), note: t.Optional(t.String({ maxLength: 500 })) }),
        response: receipt, detail: { summary: 'รับสินค้าเข้าสต็อกหลายรายการ' },
      })
      .get('/', async ({ query, branch }) => this.list.execute(query, (await branch()).id), {
        auth: { can: 'inventory.receive' }, response: page(receipt),
        query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })), offset: t.Optional(t.Numeric({ minimum: 0 })) }),
        detail: { summary: 'รายการใบรับสินค้า' },
      })
      .get('/:id', async ({ params, branch }) => this.get.execute(params, (await branch()).id), {
        auth: { can: 'inventory.receive' }, params: idParams, response: receipt, detail: { summary: 'รายละเอียดใบรับสินค้า' },
      })
  }
}
