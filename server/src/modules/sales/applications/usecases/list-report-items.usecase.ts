import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportItemsSchema } from '../schemas/sales-report.schema'

/** Query: sales, cost and profit per product and pack size, using the shares stored on each bill line. */
@injectable()
export class ListReportItemsUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const query = salesReportItemsSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    return this.reports.items({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId })
  }
}
