import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { calculateReportMetrics } from '../../../../domains/sales-report'
import { reportCategoryNamesToken, type IReportCategoryNames } from '../ports/report-category-names.port'
import { reportTimeZoneToken, type IReportTimeZone } from '../ports/report-time-zone.port'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportPageSchema } from '../schemas/sales-report.schema'

/**
 * Query: sales, cost and profit per category, each with its share of the period's net sales.
 * `name` is null when the line had no category or its category has since been deleted; the caller tells them apart by `categoryId`.
 */
@injectable()
export class ListReportCategoriesUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(reportTimeZoneToken) private readonly zone: IReportTimeZone,
    @inject(reportCategoryNamesToken) private readonly categoryNames: IReportCategoryNames,
  ) {}
  async execute(input: unknown, actor: Actor, branchId: number) {
    const { limit, offset, ...range } = salesReportPageSchema.parse(input)
    requirePermission(actor, 'reports.read', 'เฉพาะเจ้าของร้านดูรายงานได้')
    const timeZone = await this.zone.timeZone()
    const period = { ...range, timeZone, branchId: range.scope === 'all' ? null : branchId }
    const [result, overview] = await Promise.all([
      this.reports.categories({ ...period, limit, offset }),
      this.reports.overview(period),
    ])
    const ids = result.items.flatMap((row) => (row.categoryId === null ? [] : [row.categoryId]))
    const names = ids.length === 0 ? new Map<number, string>() : await this.categoryNames.namesFor(ids)
    const periodNetSales = calculateReportMetrics(overview.summary).netSalesSatang
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        name: row.categoryId === null ? null : names.get(row.categoryId) ?? null,
        profitSatang: row.netSalesSatang - row.costSatang,
        // Rounded down; a period with no net sales has no shares to give.
        shareBp: periodNetSales > 0 ? Math.floor((row.netSalesSatang * 10000) / periodNetSales) : 0,
      })),
    }
  }
}
