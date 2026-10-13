import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { SaleEntity } from '../../../../domains/sale.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CompleteSaleUseCase } from '../../applications/usecases/complete-sale.usecase'
import { GetSaleUseCase } from '../../applications/usecases/get-sale.usecase'
import { GetSalesSummaryUseCase } from '../../applications/usecases/get-sales-summary.usecase'
import { ListSalesUseCase } from '../../applications/usecases/list-sales.usecase'
import { VoidSaleUseCase } from '../../applications/usecases/void-sale.usecase'
import { saleSchemas, type SaleResponse } from './schemas/sale.schema'

// Cost and the id of whoever voided the sale are internal: they are not part of the public receipt.
function toResponse(sale: SaleEntity): SaleResponse {
  const { voidedById: _internal, items, payments, ...header } = sale.toSnapshot()
  return {
    ...header,
    items: items.map(({ unitCostSatang: _cost, ...item }) => item),
    payments,
  }
}

@injectable()
export class SaleElysiaController {
  constructor(
    @inject(ListSalesUseCase) private readonly listSales: ListSalesUseCase,
    @inject(GetSalesSummaryUseCase) private readonly getSalesSummary: GetSalesSummaryUseCase,
    @inject(GetSaleUseCase) private readonly getSale: GetSaleUseCase,
    @inject(CompleteSaleUseCase) private readonly completeSale: CompleteSaleUseCase,
    @inject(VoidSaleUseCase) private readonly voidSale: VoidSaleUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'sales', prefix: '/sales', detail: { tags: ['Sales'] } })
      .use(auth)
      .get('/', async ({ query, branch }) => this.listSales.execute(query, (await branch()).id), {
        auth: true,
        query: saleSchemas.listQuery,
        response: page(saleSchemas.saleHeader),
        detail: { summary: 'รายการบิลขาย ล่าสุดก่อน' },
      })
      .get('/summary', async ({ query, branch }) => this.getSalesSummary.execute(query, (await branch()).id), {
        auth: ['owner'],
        query: saleSchemas.summaryQuery,
        response: saleSchemas.summary,
        detail: { summary: 'สรุปยอดขายในช่วงเวลา [from, to)' },
      })
      .get('/:id', async ({ params, branch }) => toResponse(await this.getSale.execute(params.id, (await branch()).id)), {
        auth: true,
        params: idParams,
        response: saleSchemas.sale,
        detail: { summary: 'รายละเอียดบิลขาย' },
      })
      .post('/', async ({ body, user, branch }) => toResponse(await this.completeSale.execute(body, user, await branch())), {
        auth: true,
        body: saleSchemas.create,
        response: saleSchemas.sale,
        detail: { summary: 'บันทึกการขาย ตัดสต็อก และออกเลขที่ใบเสร็จ' },
      })
      .post(
        '/:id/void',
        async ({ params, body, user, branch }) =>
          toResponse(await this.voidSale.execute(params.id, body, user, (await branch()).id)),
        {
          auth: ['owner'],
          params: idParams,
          body: saleSchemas.void,
          response: saleSchemas.sale,
          detail: { summary: 'ยกเลิกบิลและคืนสต็อก' },
        },
      )
  }
}
