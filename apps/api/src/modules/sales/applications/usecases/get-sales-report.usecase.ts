import { inject, injectable } from 'tsyringe'
import type { UserEntity } from '../../../../domains/user.domain'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { calculateReportMetrics } from '../../../../domains/sales-report'
import { PAYMENT_METHODS } from '../../../../domains/sale.domain'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportSchema } from '../schemas/sales-report.schema'

/** Query: owner-only, historical totals by the shop's local calendar dates. */
@injectable()
export class GetSalesReportUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
  ) {}
  async execute(input: unknown, actor: Pick<UserEntity, 'role'>, branchId: number) {
    const query = salesReportSchema.parse(input)
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านดูรายงานได้', 'REPORT_FORBIDDEN')
    const { timeZone } = await this.settings.get()
    const result = await this.reports.overview({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId })
    return {
      from: query.from, to: query.to, timeZone, scope: query.scope,
      summary: calculateReportMetrics(result.summary),
      days: { items: result.days.map(({ day, ...sums }) => ({ day, ...calculateReportMetrics(sums) })), total: result.days.length },
      byMethod: PAYMENT_METHODS.map((method) => ({
        method,
        amountSatang: (result.tendered.find((row) => row.method === method)?.amountSatang ?? 0)
          - (method === 'cash' ? result.summary.changeSatang : 0),
      })),
    }
  }
}
