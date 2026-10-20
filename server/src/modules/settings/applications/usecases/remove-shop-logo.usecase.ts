import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { inject, injectable } from 'tsyringe'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'

/** Command: takes the logo off receipts. Removing a logo that is not there changes nothing. */
@injectable()
export class RemoveShopLogoUseCase {
  constructor(
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(actor: { id: number; displayName: string }) {
    const removed = await this.uow.run(async () => {
      const current = await this.settings.getForUpdate()
      if (current.logoKey === null) return null
      await this.settings.save(current.with({ logoKey: null }))
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'settings.logo_removed',
        entityType: 'settings',
        entityId: 'shop',
        summary: 'ลบโลโก้ใบเสร็จ',
        before: { hasLogo: true },
        after: { hasLogo: false },
      }))
      return current.logoKey
    })
    // Best effort, as when replacing the logo.
    if (removed) await this.media.delete(removed).catch(() => {})
    return this.settings.get()
  }
}
