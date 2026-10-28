import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateMemberUseCase } from '../../applications/usecases/create-member.usecase'
import { UpdateMemberUseCase } from '../../applications/usecases/update-member.usecase'
import { GetMemberUseCase } from '../../applications/usecases/get-member.usecase'
import { ListMembersUseCase } from '../../applications/usecases/list-members.usecase'
import { GetMemberSalesHistoryUseCase } from '../../applications/usecases/get-member-sales-history.usecase'
import { AdjustMemberPointsUseCase } from '../../applications/usecases/adjust-member-points.usecase'
import { ListMemberPointsUseCase } from '../../applications/usecases/list-member-points.usecase'
import { memberSchemas } from './schemas/member.schema'

@injectable()
export class MemberElysiaController {
  constructor(
    @inject(CreateMemberUseCase) private readonly createMember: CreateMemberUseCase,
    @inject(UpdateMemberUseCase) private readonly updateMember: UpdateMemberUseCase,
    @inject(GetMemberUseCase) private readonly getMember: GetMemberUseCase,
    @inject(ListMembersUseCase) private readonly listMembers: ListMembersUseCase,
    @inject(GetMemberSalesHistoryUseCase) private readonly getHistory: GetMemberSalesHistoryUseCase,
    @inject(AdjustMemberPointsUseCase) private readonly adjustPoints: AdjustMemberPointsUseCase,
    @inject(ListMemberPointsUseCase) private readonly listPoints: ListMemberPointsUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'members', prefix: '/members' }).use(auth)
      .get('/', async ({ query }) => {
        const result = await this.listMembers.execute(query)
        return { items: result.items.map((member) => member.toSnapshot()), total: result.total }
      }, { auth: true, query: memberSchemas.listQuery, response: page(memberSchemas.member), detail: { summary: 'ค้นหาสมาชิก' } })
      .post('/', async ({ body, user }) => (await this.createMember.execute(body, user)).toSnapshot(), {
        auth: true, body: memberSchemas.create, response: memberSchemas.member, detail: { summary: 'สมัครสมาชิก' },
      })
      .get('/:id', async ({ params }) => (await this.getMember.execute(params)).toSnapshot(), {
        auth: true, params: idParams, response: memberSchemas.member, detail: { summary: 'ข้อมูลสมาชิก' },
      })
      .patch('/:id', async ({ params, body, user }) => (await this.updateMember.execute(params.id, body, user)).toSnapshot(), {
        auth: { can: 'members.write' }, params: idParams, body: memberSchemas.update, response: memberSchemas.member, detail: { summary: 'แก้ไขสมาชิกและสถานะ' },
      })
      .get('/:id/sales', async ({ params, query, branch }) => this.getHistory.execute(params.id, query, (await branch()).id), {
        auth: true, params: idParams, query: memberSchemas.historyQuery, response: memberSchemas.history, detail: { summary: 'ประวัติซื้อของสมาชิกในสาขาที่เลือก' },
      })
      .get('/:id/points', async ({ params, query }) => this.listPoints.execute(params.id, query), {
        auth: true, params: idParams, query: memberSchemas.pointsQuery, response: page(memberSchemas.pointMovement), detail: { summary: 'ประวัติแต้มของสมาชิก' },
      })
      .post('/:id/points/adjustments', async ({ params, body, user, branch }) => this.adjustPoints.execute(
        params.id, body, user, (await branch()).id,
      ), {
        auth: { can: 'members.points_adjust' },
        params: idParams,
        body: memberSchemas.adjustPoints,
        response: memberSchemas.adjustResult,
        detail: { summary: 'ปรับแต้มสมาชิกด้วยมือ' },
      })
  }
}
