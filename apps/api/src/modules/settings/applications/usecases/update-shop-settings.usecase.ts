import { auditChanges } from '../../../../domains/audit-changes'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import { inject, injectable } from 'tsyringe'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'
import { shiftSettingsGuardToken } from '../../../shifts/applications/ports/shift-settings-guard.port'
import type { IShiftSettingsGuard } from '../../../shifts/applications/ports/shift-settings-guard.port'
import { TOKENS } from '../../../tokens'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { updateShopSettingsSchema } from '../schemas/settings-schemas'

/** Command: changes the given settings. Sales already made keep the VAT they were priced with. */
@injectable()
export class UpdateShopSettingsUseCase {
  constructor(
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(shiftSettingsGuardToken) private readonly shiftGuard: IShiftSettingsGuard,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) { }

  async execute(input: unknown, actor: { id: number; displayName: string }) {
    const changes = updateShopSettingsSchema.parse(input)

    return this.uow.run(async () => {
      const current = await this.settings.getForUpdate()
      if (changes.currency !== undefined && changes.currency !== current.currency)
        await this.shiftGuard.assertCurrencyChangeAllowed()
      const result = await this.settings.save(current.with(changes))
      const delta = auditChanges(current.toSnapshot(), result.toSnapshot(), Object.keys(changes))
      if (delta.changed) await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'settings.update',
        entityType: 'settings',
        entityId: 'shop',
        summary: 'แก้ไขการตั้งค่าร้าน',
        before: delta.before,
        after: delta.after,
      }))
      return result
    })
  }
}
