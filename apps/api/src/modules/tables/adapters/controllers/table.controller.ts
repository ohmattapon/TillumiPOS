import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { DiningTableEntity } from '../../../../domains/dining-table.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateTableUseCase } from '../../applications/usecases/create-table.usecase'
import { ListTablesUseCase } from '../../applications/usecases/list-tables.usecase'
import { UpdateTableUseCase } from '../../applications/usecases/update-table.usecase'
import { tableSchemas, type TableResponse } from './schemas/table.schema'

// Entities never leave the API as-is: the response shape is a contract of its own.
const toResponse = (table: DiningTableEntity, openOrders = 0, openTotalSatang = 0): TableResponse => ({
  ...table.toSnapshot(),
  openOrders,
  openTotalSatang,
})

@injectable()
export class TableElysiaController {
  constructor(
    @inject(ListTablesUseCase) private readonly listTables: ListTablesUseCase,
    @inject(CreateTableUseCase) private readonly createTable: CreateTableUseCase,
    @inject(UpdateTableUseCase) private readonly updateTable: UpdateTableUseCase,
  ) {}

  /** Mounted under /catalog. The tables are the working branch's own. */
  getRoutes() {
    return new Elysia({ name: 'catalog.tables', prefix: '/tables' })
      .use(auth)
      .get(
        '/',
        async ({ branch }) => {
          const rows = await this.listTables.execute((await branch()).id)
          return {
            items: rows.map((row) => toResponse(row.table, row.openOrders, row.openTotalSatang)),
            total: rows.length,
          }
        },
        { auth: true, response: page(tableSchemas.table), detail: { summary: 'โต๊ะของสาขาพร้อมออเดอร์ที่เปิดอยู่' } },
      )
      .post('/', async ({ body, branch }) => toResponse(await this.createTable.execute(body, (await branch()).id)), {
        auth: ['owner'],
        body: tableSchemas.create,
        response: tableSchemas.table,
        detail: { summary: 'เพิ่มโต๊ะ' },
      })
      .patch(
        '/:id',
        async ({ params, body, branch }) =>
          toResponse(await this.updateTable.execute(params.id, body, (await branch()).id)),
        {
          auth: ['owner'],
          params: idParams,
          body: tableSchemas.update,
          response: tableSchemas.table,
          detail: { summary: 'แก้ชื่อ ตำแหน่ง ขนาด หรือปิดใช้โต๊ะ' },
        },
      )
  }
}
