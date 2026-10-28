import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { PromotionEntity } from '../../../../domains/promotion.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import type { IMediaStorage } from '../../../shared/ports/media-storage.port'
import { TOKENS } from '../../../tokens'
import type { IPromotionStats } from '../../applications/ports/promotion-stats.port'
import { promotionStatsToken } from '../../applications/ports/promotion-stats.port'
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
    @inject(promotionStatsToken) private readonly stats: IPromotionStats,
  ) {}

  getRoutes() {
    // The API exposes a ready-to-use image URL; the storage key stays internal.
    const toResponse = (promotion: PromotionEntity) => {
      const { imageKey, ...fields } = snapshotOf(promotion)
      return { ...fields, imageUrl: imageKey ? this.media.urlFor(imageKey) : null } as PromotionResponse
    }

    // `isExhausted` is the promotion's own rule; this port only answers how often each was used.
    const withUsage = async (promotions: readonly PromotionEntity[]) => {
      const usage = await this.stats.usageOf(promotions.map((promotion) => promotion.id))
      return promotions.map((promotion) => {
        const usedCount = usage.get(promotion.id) ?? 0
        return { ...toResponse(promotion), usedCount, isExhausted: promotion.isExhausted(usedCount) }
      })
    }

    return new Elysia({ name: 'promotions', prefix: '/promotions', detail: { tags: ['Promotions'] } })
      .use(auth)
      .get(
        '/',
        async ({ query }) => {
          const result = await this.listPromotions.execute(query)
          return { items: await withUsage(result.items), total: result.total }
        },
        {
          auth: true,
          query: promotionSchemas.listQuery,
          response: page(promotionSchemas.promotion),
          detail: { summary: 'รายการโปรโมชัน' },
        },
      )
      .get('/:id', async ({ params }) => (await withUsage([await this.getPromotion.execute(params)]))[0]!, {
        auth: true,
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'รายละเอียดโปรโมชัน' },
      })
      .post('/', async ({ body, user }) => (await withUsage([await this.createPromotion.execute(body, user)]))[0]!, {
        auth: { can: 'promotions.write' },
        body: promotionSchemas.create,
        response: promotionSchemas.promotion,
        detail: { summary: 'สร้างโปรโมชัน' },
      })
      .patch(
        '/:id',
        async ({ params, body, user }) => (await withUsage([await this.updatePromotion.execute(params.id, body, user)]))[0]!,
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
        async ({ params, body }) => (await withUsage([await this.setPromotionImage.execute(params.id, body.file)]))[0]!,
        {
          auth: { can: 'promotions.write' },
          params: idParams,
          body: promotionSchemas.image,
          response: promotionSchemas.promotion,
          detail: { summary: 'อัปโหลดรูปโปรโมชัน (JPEG, PNG, WebP ไม่เกิน 2 MB) แทนรูปเดิม' },
        },
      )
      .delete('/:id/image', async ({ params }) => (await withUsage([await this.removePromotionImage.execute(params.id)]))[0]!, {
        auth: { can: 'promotions.write' },
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'ลบรูปโปรโมชัน' },
      })
  }
}
