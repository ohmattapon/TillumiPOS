import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { calculateReportMetrics, previousPeriod } from '../../../../domains/sales-report'
import { PAYMENT_METHODS } from '../../../../domains/sale.domain'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportSchema } from '../schemas/sales-report.schema'

/** Query: owner-only, historical totals by the shop's local calendar dates. */
@injectable()
export class GetSalesReportUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const { compare, ...query } = salesReportSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    const { cashierId, customer } = query
    const scoped = {
      scope: query.scope, timeZone, branchId: query.scope === 'all' ? null : branchId,
      ...(cashierId === undefined ? {} : { cashierId }), ...(customer === undefined ? {} : { customer }),
    }
    const result = await this.reports.overview({ ...query, ...scoped })
    const before = compare ? await this.reports.overview({ ...previousPeriod(query.from, query.to), ...scoped }) : null
    return {
      from: query.from, to: query.to, timeZone, scope: query.scope,
      summary: calculateReportMetrics(result.summary),
      unallocatedLines: result.unallocatedLines,
      ...(before ? { previous: calculateReportMetrics(before.summary) } : {}),
      days: { items: result.days.map(({ day, ...sums }) => ({ day, ...calculateReportMetrics(sums) })), total: result.days.length },
      byMethod: PAYMENT_METHODS.map((method) => ({
        method,
        amountSatang: (result.tendered.find((row) => row.method === method)?.amountSatang ?? 0)
          - (method === 'cash' ? result.summary.changeSatang : 0),
      })),
    }
  }
}
