import { inject, injectable } from 'tsyringe'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainError } from '../../../../domains/errors/domain-error'
import { shopSettingsRepositoryToken, type IShopSettingsRepository } from '../../../settings/applications/ports/shop-settings.repository'
import { auditLogToken, type IAuditLog } from '../ports/audit-log.port'
import { auditFilterSchema } from '../schemas/audit-schemas'

/** Query: read immutable audit history by shop-local calendar days. */
@injectable()
export class ListAuditLogsUseCase {
  constructor(
    @inject(auditLogToken) private readonly audit: IAuditLog,
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
  ) {}

  async execute(input: unknown, actor: Actor) {
    const { limit, offset, ...filter } = auditFilterSchema.parse(input)
    requirePermission(actor, 'audit.read')
    if (filter.from && filter.to && filter.from > filter.to)
      throw new DomainError('ช่วงวันที่ไม่ถูกต้อง', 'INVALID_RANGE')
    const { timeZone } = await this.settings.get()
    return this.audit.list({ ...filter, timeZone }, { limit, offset })
  }
}
