import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { slideRepositoryToken, type ISlideRepository } from '../ports/slide.repository'
import { updateSlideSchema } from '../schemas/slide-schemas'

/** Command: reorders a slide or switches it on or off. */
@injectable()
export class UpdateSlideUseCase {
  constructor(
    @inject(slideRepositoryToken) private readonly slides: ISlideRepository,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(id: number, input: unknown, actor: Actor & { id: number; displayName: string }) {
    const changes = updateSlideSchema.parse(input)
    requirePermission(actor, 'promotions.write', 'เฉพาะเจ้าของร้านจัดการสไลด์ได้')

    return this.unitOfWork.run(async () => {
      const existing = await this.slides.findById(id)
      if (!existing) throw new DomainNotFoundError('ไม่พบสไลด์')

      const updated = await this.slides.update(existing.with(changes))
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'display-slide.update',
        entityType: 'display-slide',
        entityId: String(updated.id),
        summary: 'แก้ไขสไลด์จอลูกค้า',
        before: existing.toSnapshot(),
        after: updated.toSnapshot(),
      }))
      return updated
    })
  }
}
