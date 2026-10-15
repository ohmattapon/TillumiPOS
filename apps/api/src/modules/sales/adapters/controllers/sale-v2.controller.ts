import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { auth } from '../../../auth.plugin'
import { idempotencyHeaders, idParams } from '../../../../libs/http-schemas'
import { CompleteSaleV2UseCase } from '../../applications/usecases/complete-sale-v2.usecase'
import { VoidSaleV2UseCase } from '../../applications/usecases/void-sale-v2.usecase'
import { RecordCashRefundUseCase } from '../../applications/usecases/record-cash-refund.usecase'
import { t } from 'elysia'
import { saleSchemas } from './schemas/sale.schema'
import { toSaleV2Response } from './sale-v2.presenter'

@injectable()
export class SaleV2ElysiaController {
  constructor(
    @inject(CompleteSaleV2UseCase) private readonly completeSale: CompleteSaleV2UseCase,
    @inject(VoidSaleV2UseCase) private readonly voidSale: VoidSaleV2UseCase,
    @inject(RecordCashRefundUseCase) private readonly recordCashRefund: RecordCashRefundUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'v2.sales', prefix: '/sales', detail: { tags: ['Sales'] } })
      .use(auth)
      .post('/', async ({ body, headers, user, branch }) => {
        const selectedBranch = await branch()
        return toSaleV2Response(await this.completeSale.execute(body,
          { id: user.id, displayName: user.displayName },
          { id: selectedBranch.id, code: selectedBranch.code },
          headers['idempotency-key'],
        ))
      }, {
        auth: true,
        headers: idempotencyHeaders,
        body: saleSchemas.createV2,
        response: saleSchemas.saleV2,
        detail: { summary: 'v2: บันทึกการขายในกะที่เปิดอยู่' },
      })
      .post('/:id/void', async ({ params, body, headers, user, branch }) => {
        const selectedBranch = await branch()
        return toSaleV2Response(await this.voidSale.execute(params.id, body, { id: user.id }, selectedBranch.id, headers['idempotency-key']))
      }, {
        auth: ['owner'], params: idParams, headers: idempotencyHeaders, body: saleSchemas.void,
        response: saleSchemas.saleV2, detail: { summary: 'v2: ยกเลิกบิลและคืนสต็อก' },
      })
      .post('/:id/cash-refund', async ({ params, body, headers, user, branch }) => {
        const selectedBranch = await branch()
        const result = await this.recordCashRefund.execute(params.id, body, { id: user.id, displayName: user.displayName }, selectedBranch.id, headers['idempotency-key'])
        return result
      }, {
        auth: ['owner'], params: idParams, headers: idempotencyHeaders,
        body: t.Object({ shiftId: t.Integer({ minimum: 1 }), reason: t.String({ minLength: 1, maxLength: 500 }) }),
        response: t.Object({ shiftId: t.Integer(), saleId: t.Integer(), amountSatang: t.Integer() }),
        detail: { summary: 'v2: บันทึกคืนเงินสดเต็มจำนวนของบิลที่ยกเลิกแล้ว' },
      })
  }
}
