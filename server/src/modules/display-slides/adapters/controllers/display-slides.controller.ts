import { Elysia, t } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { SlideEntity } from '../../../../domains/slide.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { DeleteSlideUseCase } from '../../applications/usecases/delete-slide.usecase'
import { ListActiveSlidesUseCase } from '../../applications/usecases/list-active-slides.usecase'
import { ListSlidesUseCase } from '../../applications/usecases/list-slides.usecase'
import { UpdateSlideUseCase } from '../../applications/usecases/update-slide.usecase'
import { UploadSlideImageUseCase } from '../../applications/usecases/upload-slide-image.usecase'
import { slideSchemas, type SlideResponse } from './schemas/slide.schema'

@injectable()
export class DisplaySlideElysiaController {
  constructor(
    @inject(ListActiveSlidesUseCase) private readonly listActive: ListActiveSlidesUseCase,
    @inject(ListSlidesUseCase) private readonly listAll: ListSlidesUseCase,
    @inject(UploadSlideImageUseCase) private readonly upload: UploadSlideImageUseCase,
    @inject(UpdateSlideUseCase) private readonly update: UpdateSlideUseCase,
    @inject(DeleteSlideUseCase) private readonly remove: DeleteSlideUseCase,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  getRoutes() {
    const toResponse = (slide: SlideEntity): SlideResponse => ({
      id: slide.id,
      imageUrl: this.media.urlFor(slide.imageKey),
      sortOrder: slide.sortOrder,
      isActive: slide.isActive,
    })

    /**
     * `GET /` is open on purpose: these are the same marketing pictures the customer display
     * already shows, with no prices, no names and no PII — only the shop owner can change them.
     */
    return new Elysia({ name: 'display-slides', prefix: '/display-slides', detail: { tags: ['Display slides'] } })
      .use(auth)
      .get(
        '/',
        async () => {
          const items = (await this.listActive.execute()).map(toResponse)
          return { items, total: items.length }
        },
        { response: page(slideSchemas.slide), detail: { summary: 'รูปสไลด์ที่แสดงบนจอลูกค้า' } },
      )
      .get(
        '/all',
        async ({ user }) => {
          const items = (await this.listAll.execute(user)).map(toResponse)
          return { items, total: items.length }
        },
        {
          auth: { can: 'promotions.write' },
          response: page(slideSchemas.slide),
          detail: { summary: 'รูปสไลด์ทั้งหมด (เจ้าของร้าน)' },
        },
      )
      .post('/', async ({ body, user }) => toResponse(await this.upload.execute(body, user)), {
        auth: { can: 'promotions.write' },
        body: slideSchemas.upload,
        response: slideSchemas.slide,
        detail: { summary: 'อัปโหลดรูปสไลด์ (JPEG, PNG, WebP ไม่เกิน 5 MB)' },
      })
      .patch('/:id', async ({ params, body, user }) => toResponse(await this.update.execute(params.id, body, user)), {
        auth: { can: 'promotions.write' },
        params: idParams,
        body: slideSchemas.update,
        response: slideSchemas.slide,
        detail: { summary: 'เรียงลำดับหรือเปิด/ปิดรูปสไลด์' },
      })
      .delete('/:id', async ({ params, user }) => {
        await this.remove.execute(params.id, user)
        return { ok: true }
      }, {
        auth: { can: 'promotions.write' },
        params: idParams,
        response: t.Object({ ok: t.Boolean() }),
        detail: { summary: 'ลบรูปสไลด์' },
      })
  }
}
