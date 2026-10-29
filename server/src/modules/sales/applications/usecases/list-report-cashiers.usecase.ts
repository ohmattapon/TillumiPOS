import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportRangeSchema } from '../schemas/sales-report.schema'

/** Query: who sold in the range, so the owner can pick a cashier to filter the other reports by. */
@injectable()
export class ListReportCashiersUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const query = salesReportRangeSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    const items = await this.reports.cashiers({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId })
    return { items, total: items.length }
  }
}
