import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { BranchEntity } from '../../../../domains/branch.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateBranchUseCase } from '../../applications/usecases/create-branch.usecase'
import { ListBranchesUseCase } from '../../applications/usecases/list-branches.usecase'
import { UpdateBranchUseCase } from '../../applications/usecases/update-branch.usecase'
import { branchSchemas, type BranchResponse } from './schemas/branch.schema'

const toResponse = (branch: BranchEntity): BranchResponse => branch.toSnapshot()

@injectable()
export class BranchElysiaController {
  constructor(
    @inject(ListBranchesUseCase) private readonly listBranches: ListBranchesUseCase,
    @inject(CreateBranchUseCase) private readonly createBranch: CreateBranchUseCase,
    @inject(UpdateBranchUseCase) private readonly updateBranch: UpdateBranchUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'branches', prefix: '/branches', detail: { tags: ['Branches'] } })
      .use(auth)
      .get(
        '/',
        async ({ user }) => {
          const items = (await this.listBranches.execute(user)).map(toResponse)
          return { items, total: items.length }
        },
        {
          auth: true,
          response: page(branchSchemas.branch),
          detail: { summary: 'รายการสาขา (เจ้าของเห็นทุกสาขา พนักงานเห็นสาขาของตน)' },
        },
      )
      .post('/', async ({ body }) => toResponse(await this.createBranch.execute(body)), {
        auth: { can: 'branches.manage' },
        body: branchSchemas.create,
        response: branchSchemas.branch,
        detail: { summary: 'เพิ่มสาขา' },
      })
      .patch('/:id', async ({ params, body }) => toResponse(await this.updateBranch.execute(params.id, body)), {
        auth: { can: 'branches.manage' },
        params: idParams,
        body: branchSchemas.update,
        response: branchSchemas.branch,
        detail: { summary: 'แก้ไขหรือปิดสาขา' },
      })
  }
}
