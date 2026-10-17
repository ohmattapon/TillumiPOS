import { inject, injectable } from 'tsyringe'
import { buildAuditEntry } from '../../../../domains/audit-entry.vo'
import { requirePermission, type Actor } from '../../../../domains/authorization'
import { DomainError } from '../../../../domains/errors/domain-error'
import { DomainExternalServiceError } from '../../../../domains/errors/domain-external-service.error'
import { SlideEntity } from '../../../../domains/slide.domain'
import { auditLogToken, type IAuditLog } from '../../../audit/applications/ports/audit-log.port'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import type { IUnitOfWork } from '../../../shared/ports/unit-of-work.port'
import { TOKENS } from '../../../tokens'
import { slideRepositoryToken, type ISlideRepository } from '../ports/slide.repository'
import { MAX_SLIDE_IMAGE_BYTES, uploadSlideImageSchema } from '../schemas/slide-schemas'

const EXTENSION_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Command: stores a new slide image under a fresh key and records the slide. */
@injectable()
export class UploadSlideImageUseCase {
  constructor(
    @inject(slideRepositoryToken) private readonly slides: ISlideRepository,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
    @inject(TOKENS.UnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(auditLogToken) private readonly audit: IAuditLog,
  ) {}

  async execute(input: unknown, actor: Actor & { id: number; displayName: string }) {
    const dto = uploadSlideImageSchema.parse(input)
    requirePermission(actor, 'promotions.write', 'เฉพาะเจ้าของร้านจัดการสไลด์ได้')

    const extension = EXTENSION_BY_TYPE[dto.file.type]
    if (!extension) throw new DomainError('ไฟล์ต้องเป็นรูป JPEG, PNG หรือ WebP', 'INVALID_FILE_TYPE')
    if (dto.file.size > MAX_SLIDE_IMAGE_BYTES)
      throw new DomainError('รูปต้องมีขนาดไม่เกิน 5 MB', 'IMAGE_TOO_LARGE')
    if (!this.media.isEnabled())
      throw new DomainExternalServiceError('ร้านนี้ปิดการใช้รูปภาพอยู่', 'MEDIA_UNAVAILABLE')

    // A new key per upload lets browsers and the edge cache images forever.
    const key = ['slides', crypto.randomUUID() + '.' + extension].join('/')
    // Outside the transaction: never hold a unit of work across a call to an outside system.
    await this.media.put(key, dto.file)

    return this.unitOfWork.run(async () => {
      const existing = await this.slides.findAll()
      const appended = existing.reduce((max, slide) => Math.max(max, slide.sortOrder), -1) + 1
      const created = await this.slides.create(
        new SlideEntity({
          id: 0,
          imageKey: key,
          sortOrder: dto.sortOrder ?? appended,
          isActive: dto.isActive ?? true,
        }),
      )
      await this.audit.record({ id: actor.id, name: actor.displayName }, null, buildAuditEntry({
        action: 'display-slide.create',
        entityType: 'display-slide',
        entityId: String(created.id),
        summary: 'เพิ่มรูปสไลด์จอลูกค้า',
        after: created.toSnapshot(),
      }))
      return created
    })
  }
}
