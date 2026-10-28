import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { slideRepositoryToken, type ISlideRepository } from '../ports/slide.repository'
import { slideIdSchema } from '../schemas/slide-schemas'

/** Command: removes a slide; its image file is cleaned up best-effort. */
@injectable()
export class DeleteSlideUseCase {
  constructor(
    @inject(slideRepositoryToken) private readonly slides: ISlideRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(id: unknown, actor: Actor & { id: number; displayName: string }) {
    const slideId = slideIdSchema.parse(id)
    requirePermission(actor, 'promotions.write', 'เฉพาะเจ้าของร้านจัดการสไลด์ได้')

    const removed = await this.unitOfWork.run(async () => {
      const deleted = await this.slides.delete(slideId)
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'display-slide.delete',
        entityType: 'display-slide',
        entityId: String(deleted.id),
        summary: 'ลบรูปสไลด์จอลูกค้า',
        before: deleted.toSnapshot(),
      }))
      return deleted
    })
    // Best effort: a leftover object is harmless, so a failed cleanup must not fail the request.
    await this.media.delete(removed.imageKey).catch(() => {})
    return removed
  }
}
