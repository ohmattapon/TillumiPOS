import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { PromotionEntity } from '../../../../domains/promotion.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import { CreatePromotionUseCase } from '../../applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from '../../applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from '../../applications/usecases/list-promotions.usecase'
import { RemovePromotionImageUseCase } from '../../applications/usecases/remove-promotion-image.usecase'
import { SetPromotionImageUseCase } from '../../applications/usecases/set-promotion-image.usecase'
import { UpdatePromotionUseCase } from '../../applications/usecases/update-promotion.usecase'
import { snapshotOf } from '../promotion.snapshot'
import { promotionSchemas, type PromotionResponse } from './schemas/promotion.schema'

@injectable()
export class PromotionElysiaController {
  constructor(
    @inject(CreatePromotionUseCase) private readonly createPromotion: CreatePromotionUseCase,
    @inject(UpdatePromotionUseCase) private readonly updatePromotion: UpdatePromotionUseCase,
    @inject(GetPromotionUseCase) private readonly getPromotion: GetPromotionUseCase,
    @inject(ListPromotionsUseCase) private readonly listPromotions: ListPromotionsUseCase,
    @inject(SetPromotionImageUseCase) private readonly setPromotionImage: SetPromotionImageUseCase,
    @inject(RemovePromotionImageUseCase) private readonly removePromotionImage: RemovePromotionImageUseCase,
    @inject(TOKENS.MediaStorage) private readonly media: IMediaStorage,
  ) {}

  getRoutes() {
    // The API exposes a ready-to-use image URL; the storage key stays internal.
    const toResponse = (promotion: PromotionEntity) => {
      const { imageKey, ...fields } = snapshotOf(promotion)
      // The kind union widens with Task 2's OpenAPI change, when the migration actually allows storing a
      // bundle; no such promotion can be stored before that, but the snapshot type already carries the union.
      return { ...fields, imageUrl: imageKey ? this.media.urlFor(imageKey) : null } as PromotionResponse
    }

    return new Elysia({ name: 'promotions', prefix: '/promotions', detail: { tags: ['Promotions'] } })
      .use(auth)
      .get(
        '/',
        async ({ query }) => {
          const result = await this.listPromotions.execute(query)
          return { items: result.items.map(toResponse), total: result.total }
        },
        {
          auth: true,
          query: promotionSchemas.listQuery,
          response: page(promotionSchemas.promotion),
          detail: { summary: 'รายการโปรโมชัน' },
        },
      )
      .get('/:id', async ({ params }) => toResponse(await this.getPromotion.execute(params)), {
        auth: true,
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'รายละเอียดโปรโมชัน' },
      })
      .post('/', async ({ body, user }) => toResponse(await this.createPromotion.execute(body, user)), {
        auth: { can: 'promotions.write' },
        body: promotionSchemas.create,
        response: promotionSchemas.promotion,
        detail: { summary: 'สร้างโปรโมชัน' },
      })
      .patch(
        '/:id',
        async ({ params, body, user }) => toResponse(await this.updatePromotion.execute(params.id, body, user)),
        {
          auth: { can: 'promotions.write' },
          params: idParams,
          body: promotionSchemas.update,
          response: promotionSchemas.promotion,
          detail: { summary: 'แก้ไขโปรโมชันและเปิด/ปิดใช้' },
        },
      )
      .put(
        '/:id/image',
        async ({ params, body }) => toResponse(await this.setPromotionImage.execute(params.id, body.file)),
        {
          auth: { can: 'promotions.write' },
          params: idParams,
          body: promotionSchemas.image,
          response: promotionSchemas.promotion,
          detail: { summary: 'อัปโหลดรูปโปรโมชัน (JPEG, PNG, WebP ไม่เกิน 2 MB) แทนรูปเดิม' },
        },
      )
      .delete('/:id/image', async ({ params }) => toResponse(await this.removePromotionImage.execute(params.id)), {
        auth: { can: 'promotions.write' },
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'ลบรูปโปรโมชัน' },
      })
  }
}
