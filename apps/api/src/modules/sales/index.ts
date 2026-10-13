import { Elysia, t } from 'elysia'
import { idParams } from '../../shared/models'
import { auth } from '../auth.plugin'
import { SaleModel } from './model'
import { SalesService } from './service'

export const sales = new Elysia({ name: 'sales', prefix: '/sales', detail: { tags: ['Sales'] } })
  .use(auth)
  .get('/', ({ query }) => SalesService.list(query), {
    auth: true,
    query: SaleModel.listQuery,
    response: t.Array(SaleModel.saleHeader),
    detail: { summary: 'รายการบิลขาย ล่าสุดก่อน' },
  })
  .get('/summary', ({ query }) => SalesService.summary(query), {
    auth: ['owner'],
    query: SaleModel.summaryQuery,
    response: SaleModel.summary,
    detail: { summary: 'สรุปยอดขายในช่วงเวลา [from, to)' },
  })
  .get('/:id', ({ params }) => SalesService.getById(params.id), {
    auth: true,
    params: idParams,
    response: SaleModel.sale,
    detail: { summary: 'รายละเอียดบิลขาย' },
  })
  .post('/', ({ body, user }) => SalesService.create(body, user), {
    auth: true,
    body: SaleModel.create,
    response: SaleModel.sale,
    detail: { summary: 'บันทึกการขาย ตัดสต็อก และออกเลขที่ใบเสร็จ' },
  })
  .post('/:id/void', ({ params, body, user }) => SalesService.void(params.id, body.reason, user), {
    auth: ['owner'],
    params: idParams,
    body: SaleModel.void,
    response: SaleModel.sale,
    detail: { summary: 'ยกเลิกบิลและคืนสต็อก' },
  })
