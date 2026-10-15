import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateRegisterUseCase, ListRegistersUseCase, UpdateRegisterUseCase } from '../../applications/usecases/register.usecases'
import { GetCurrentShiftUseCase } from '../../applications/usecases/shift-lifecycle.usecases'
import { shiftHttpSchemas } from './schemas/shift.schema'

@injectable()
export class RegisterElysiaController {
  constructor(
    @inject(ListRegistersUseCase) private readonly list: ListRegistersUseCase,
    @inject(CreateRegisterUseCase) private readonly create: CreateRegisterUseCase,
    @inject(UpdateRegisterUseCase) private readonly update: UpdateRegisterUseCase,
    @inject(GetCurrentShiftUseCase) private readonly currentShift: GetCurrentShiftUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'v2.registers', prefix: '/registers', detail: { tags: ['Registers'] } })
      .use(auth)
      .get('/', async ({ branch }) => {
        const items = await this.list.execute((await branch()).id)
        return { items: items.map((item) => item.toSnapshot()), total: items.length }
      }, { auth: true, response: page(shiftHttpSchemas.register), detail: { summary: 'รายการจุดขายของสาขา' } })
      .post('/', async ({ body, branch }) => (await this.create.execute(body, (await branch()).id)).toSnapshot(), {
        auth: ['owner'], body: shiftHttpSchemas.createRegister, response: shiftHttpSchemas.register, detail: { summary: 'สร้างจุดขาย' },
      })
      .patch('/:id', async ({ params, body, branch }) =>
        (await this.update.execute(params.id, body, (await branch()).id)).toSnapshot(), {
          auth: ['owner'], params: idParams, body: shiftHttpSchemas.updateRegister, response: shiftHttpSchemas.register, detail: { summary: 'แก้ชื่อหรือปิดใช้งานจุดขาย' },
        })
      .get('/:id/current-shift', async ({ params, branch }) => {
        const shift = await this.currentShift.execute(params.id, (await branch()).id)
        return shift && {
          id: shift.id, registerId: shift.registerId, status: shift.status as 'open' | 'closing', openedAt: shift.openedAt,
          openedByName: shift.openedByName, openingCashSatang: shift.openingCashSatang, closingRevision: shift.closingRevision,
        }
      }, { auth: true, params: idParams, response: shiftHttpSchemas.currentShift, detail: { summary: 'กะปัจจุบันของจุดขาย' } })
  }
}
