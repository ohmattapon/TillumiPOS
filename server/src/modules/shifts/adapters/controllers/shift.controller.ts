import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idempotencyHeaders, idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import {
  CancelShiftClosingUseCase,
  CloseShiftUseCase,
  GetShiftUseCase,
  ListShiftCashEntriesUseCase,
  ListShiftsUseCase,
  RecordCashMovementUseCase,
  StartShiftClosingUseCase,
} from '../../applications/usecases/shift-lifecycle.usecases'
import { GetShiftSummaryUseCase } from '../../applications/usecases/get-shift-summary.usecase'
import { OpenShiftUseCase } from '../../applications/usecases/open-shift.usecase'
import { shiftHttpSchemas } from './schemas/shift.schema'

@injectable()
export class ShiftElysiaController {
  constructor(
    @inject(ListShiftsUseCase) private readonly list: ListShiftsUseCase,
    @inject(GetShiftUseCase) private readonly get: GetShiftUseCase,
    @inject(OpenShiftUseCase) private readonly open: OpenShiftUseCase,
    @inject(StartShiftClosingUseCase) private readonly startClosing: StartShiftClosingUseCase,
    @inject(CancelShiftClosingUseCase) private readonly cancelClosing: CancelShiftClosingUseCase,
    @inject(CloseShiftUseCase) private readonly close: CloseShiftUseCase,
    @inject(RecordCashMovementUseCase) private readonly recordCash: RecordCashMovementUseCase,
    @inject(ListShiftCashEntriesUseCase) private readonly listCash: ListShiftCashEntriesUseCase,
    @inject(GetShiftSummaryUseCase) private readonly summary: GetShiftSummaryUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'v2.shifts', prefix: '/shifts', detail: { tags: ['Shifts'] } })
      .use(auth)
      .get('/', async ({ query, branch }) => {
        const { items, total } = await this.list.execute(query, (await branch()).id)
        return { items: items.map((item) => item.toSnapshot()), total }
      }, { auth: true, query: shiftHttpSchemas.shiftListQuery, response: page(shiftHttpSchemas.shift), detail: { summary: 'ประวัติกะของสาขา' } })
      .post('/', async ({ body, headers, user, branch }) =>
        (await this.open.execute(body, user, (await branch()).id, headers['idempotency-key'])).toSnapshot(), {
          auth: true, headers: idempotencyHeaders, body: shiftHttpSchemas.openShift, response: shiftHttpSchemas.shift, detail: { summary: 'เปิดกะ' },
        })
      .get('/:id', async ({ params, branch }) => (await this.get.execute(params.id, (await branch()).id)).toSnapshot(), {
        auth: true, params: idParams, response: shiftHttpSchemas.shift, detail: { summary: 'รายละเอียดกะ' },
      })
      .get('/:id/summary', async ({ params, branch }) => this.summary.execute(params.id, (await branch()).id), {
        auth: true, params: idParams, response: shiftHttpSchemas.summary,
        detail: { summary: 'สรุปกะ: ยอด ณ ขณะนี้ถ้ากะเปิดอยู่ หรือยอดที่หยุดไว้ตอนเริ่มนับ' },
      })
      .post('/:id/cash-entries', async ({ params, body, headers, user, branch }) =>
        (await this.recordCash.execute(params.id, body, user, (await branch()).id, headers['idempotency-key'])).toSnapshot(), {
          auth: true, headers: idempotencyHeaders, params: idParams, body: shiftHttpSchemas.cashMovement, response: shiftHttpSchemas.cashEntry, detail: { summary: 'บันทึกเงินเข้า–ออก' },
        })
      .get('/:id/cash-entries', async ({ params, query, branch }) => {
        const { items, total } = await this.listCash.execute(params.id, query, (await branch()).id)
        return { items: items.map((item) => item.toSnapshot()), total }
      }, { auth: true, params: idParams, query: shiftHttpSchemas.pageQuery, response: page(shiftHttpSchemas.cashEntry), detail: { summary: 'รายการเคลื่อนไหวเงินสดของกะ' } })
      .post('/:id/start-closing', async ({ params, body, headers, user, branch }) =>
        (await this.startClosing.execute(params.id, body, user, (await branch()).id, headers['idempotency-key'])).toSnapshot(), {
          auth: true, headers: idempotencyHeaders, params: idParams, body: shiftHttpSchemas.startClosing, response: shiftHttpSchemas.shift, detail: { summary: 'เริ่มนับเงินปิดกะ' },
        })
      .post('/:id/cancel-closing', async ({ params, body, headers, user, branch }) =>
        (await this.cancelClosing.execute(params.id, body, user, (await branch()).id, headers['idempotency-key'])).toSnapshot(), {
          auth: true, headers: idempotencyHeaders, params: idParams, body: shiftHttpSchemas.shiftRevision, response: shiftHttpSchemas.shift, detail: { summary: 'ยกเลิกการนับกะ' },
        })
      .post('/:id/close', async ({ params, body, headers, user, branch }) =>
        (await this.close.execute(params.id, body, user, (await branch()).id, headers['idempotency-key'])).toSnapshot(), {
          auth: true, headers: idempotencyHeaders, params: idParams, body: shiftHttpSchemas.closeShift, response: shiftHttpSchemas.shift, detail: { summary: 'ยืนยันปิดกะ' },
        })
  }
}
