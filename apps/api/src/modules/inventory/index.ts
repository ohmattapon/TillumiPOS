import { Elysia, t } from 'elysia'
import { auth } from '../../shared/plugins/auth'
import { InventoryModel } from './model'
import { InventoryService } from './service'

export const inventory = new Elysia({ name: 'inventory', prefix: '/inventory', detail: { tags: ['Inventory'] } })
  .use(auth)
  .get('/movements', ({ query }) => InventoryService.listMovements(query), {
    auth: true,
    query: InventoryModel.movementsQuery,
    response: t.Array(InventoryModel.movement),
    detail: { summary: 'ประวัติการเคลื่อนไหวสต็อก ล่าสุดก่อน' },
  })
  .post('/receive', ({ body, user }) => InventoryService.receive(body, user.id), {
    auth: ['owner'],
    body: InventoryModel.receive,
    response: InventoryModel.movement,
    detail: { summary: 'รับสินค้าเข้าสต็อก' },
  })
  .post('/adjust', ({ body, user }) => InventoryService.adjust(body, user.id), {
    auth: ['owner'],
    body: InventoryModel.adjust,
    response: InventoryModel.movement,
    detail: { summary: 'ปรับยอดสต็อกให้ตรงกับที่นับได้จริง' },
  })
