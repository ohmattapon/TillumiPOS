import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportPageSchema } from '../schemas/sales-report.schema'

/** Query: paginated best sellers, using stored item names and prices. */
@injectable()
export class ListReportProductsUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const query = salesReportPageSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    return this.reports.products({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId })
  }
}
