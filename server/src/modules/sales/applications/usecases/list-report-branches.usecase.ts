import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { calculateReportMetrics } from '../../../../domains/sales-report'
import { branchRepositoryToken, type IBranchRepository } from '../../../branches/applications/ports/branch.repository'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportPageSchema } from '../schemas/sales-report.schema'

/** Query: branch comparison, including branches that have since closed. */
@injectable()
export class ListReportBranchesUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(branchRepositoryToken) private readonly branches: IBranchRepository,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const query = salesReportPageSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const { timeZone } = await this.settings.get()
    const [result, branches] = await Promise.all([
      this.reports.branches({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId }),
      this.branches.findAll(),
    ])
    return {
      ...result,
      items: result.items.map(({ branchId: id, ...sums }) => ({
        branchId: id, branchName: branches.find((branch) => branch.id === id)?.name ?? String(id),
        ...calculateReportMetrics(sums),
      })),
    }
  }
}
