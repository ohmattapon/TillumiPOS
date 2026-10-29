import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { calculateReportMetrics } from '../../../../domains/sales-report'
import { reportBranchNamesToken, type IReportBranchNames } from '../ports/report-branch-names.port'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportPageSchema } from '../schemas/sales-report.schema'

/** Query: branch comparison, including branches that have since closed. */
@injectable()
export class ListReportBranchesUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
    @inject(reportBranchNamesToken) private readonly branchNames: IReportBranchNames,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const query = salesReportPageSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    const [result, names] = await Promise.all([
      this.reports.branches({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId }),
      this.branchNames.namesById(),
    ])
    return {
      ...result,
      items: result.items.map(({ branchId: id, ...sums }) => ({
        branchId: id, branchName: names.get(id) ?? String(id),
        ...calculateReportMetrics(sums),
      })),
    }
  }
}
