import { inject, injectable } from 'tsyringe'
import type { UserEntity } from '../../../../domains/user.domain'
import { DomainForbiddenError } from '../../../../domains/errors/domain-forbidden.error'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { salesReportRepositoryToken, type ISalesReportRepository } from '../ports/sales-report.repository'
import { salesReportPageSchema } from '../schemas/sales-report.schema'

/** Query: paginated best sellers, using stored item names and prices. */
@injectable()
export class ListReportProductsUseCase {
  constructor(
    @inject(salesReportRepositoryToken) private readonly reports: ISalesReportRepository,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
  ) {}
  async execute(input: unknown, actor: Pick<UserEntity, 'role'>, branchId: number) {
    const query = salesReportPageSchema.parse(input)
    if (actor.role !== 'owner') throw new DomainForbiddenError('เฉพาะเจ้าของร้านดูรายงานได้', 'REPORT_FORBIDDEN')
    const { timeZone } = await this.settings.get()
    return this.reports.products({ ...query, timeZone, branchId: query.scope === 'all' ? null : branchId })
  }
}
