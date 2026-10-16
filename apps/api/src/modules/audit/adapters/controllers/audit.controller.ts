import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { ListAuditLogsUseCase } from '../../applications/usecases/list-audit-logs.usecase'
import { auditSchemas } from './schemas/audit.schema'

@injectable()
export class AuditElysiaController {
  constructor(@inject(ListAuditLogsUseCase) private readonly list: ListAuditLogsUseCase) {}
  getRoutes() {
    return new Elysia({ name: 'audit', prefix: '/audit-logs', detail: { tags: ['Audit'] } })
      .use(auth)
      .get('/', ({ query, user }) => this.list.execute(query, user), {
        auth: true, query: auditSchemas.query, response: page(auditSchemas.record), detail: { summary: 'ประวัติการกระทำ' },
      })
  }
}
