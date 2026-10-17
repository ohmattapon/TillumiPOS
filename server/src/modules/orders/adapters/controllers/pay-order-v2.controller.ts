import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idempotencyHeaders, idParams } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { toSaleV2Response } from '../../../sales/adapters/controllers/sale-v2.presenter'
import { saleSchemas } from '../../../sales/adapters/controllers/schemas/sale.schema'
import { PayOrderV2UseCase } from '../../applications/usecases/pay-order-v2.usecase'
import { orderSchemas } from './schemas/order.schema'

@injectable()
export class PayOrderV2ElysiaController {
  constructor(@inject(PayOrderV2UseCase) private readonly payOrder: PayOrderV2UseCase) {}

  getRoutes() {
    return new Elysia({ name: 'v2.orders.pay', prefix: '/orders', detail: { tags: ['Orders'] } })
      .use(auth)
      .post('/:id/pay', async ({ params, body, headers, user, branch }) => {
        const selectedBranch = await branch()
        return toSaleV2Response(await this.payOrder.execute(params.id, body, {
          user: { id: user.id, displayName: user.displayName },
          branch: { id: selectedBranch.id, code: selectedBranch.code },
        }, headers['idempotency-key']))
      }, {
        auth: true,
        headers: idempotencyHeaders,
        params: idParams,
        body: orderSchemas.payV2,
        response: saleSchemas.saleV2,
        detail: { summary: 'v2: ชำระออเดอร์ในกะที่เปิดอยู่' },
      })
  }
}
