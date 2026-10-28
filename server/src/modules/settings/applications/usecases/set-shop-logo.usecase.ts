import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { DomainError } from '../../../../domains/errors/domain-error'
import { buildLogoKey } from '../../../../domains/shop-settings.domain'
import { inject, injectable } from 'tsyringe'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IIdGenerator } from '../../../shared/ports/id-generator.port'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { shopSettingsRepositoryToken } from '../ports/shop-settings.repository'
import type { IShopSettingsRepository } from '../ports/shop-settings.repository'

const EXTENSION_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Command: stores the picture printed at the top of receipts under a fresh key, then drops the one it replaces. */
@injectable()
export class SetShopLogoUseCase {
  constructor(
    @inject(shopSettingsRepositoryToken) private readonly settings: IShopSettingsRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
    @inject(TOKENS.UnitOfWork) private readonly uow: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
    @inject(TOKENS.IdGenerator) private readonly ids: IIdGenerator,
  ) {}

  async execute(file: Blob, actor: { id: number; displayName: string }) {
    const extension = EXTENSION_BY_TYPE[file.type]
    if (!extension) throw new DomainError('ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP', 'INVALID_FILE_TYPE')

    // The upload is an outside call, so it stays out of the transaction.
    const key = buildLogoKey(this.ids.newId(), extension)
    await this.media.put(key, file)

    try {
      const previous = await this.uow.run(async () => {
        const current = await this.settings.getForUpdate()
        await this.settings.save(current.with({ logoKey: key }))
        await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
          action: 'settings.logo_set',
          entityType: 'settings',
          entityId: 'shop',
          summary: 'ตั้งโลโก้ใบเสร็จ',
          before: { hasLogo: current.logoKey !== null },
          after: { hasLogo: true },
        }))
        return current.logoKey
      })
      // Best effort: a leftover picture is harmless, so a failed cleanup must not fail the request.
      if (previous) await this.media.delete(previous).catch(() => {})
    } catch (error) {
      await this.media.delete(key).catch(() => {})
      throw error
    }
    return this.settings.get()
  }
}
