import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { snapshotOf } from '../promotion.snapshot'
import { CreatePromotionUseCase } from '../../applications/usecases/create-promotion.usecase'
import { GetPromotionUseCase } from '../../applications/usecases/get-promotion.usecase'
import { ListPromotionsUseCase } from '../../applications/usecases/list-promotions.usecase'
import { UpdatePromotionUseCase } from '../../applications/usecases/update-promotion.usecase'
import { promotionSchemas } from './schemas/promotion.schema'

@injectable()
export class PromotionElysiaController {
  constructor(
    @inject(CreatePromotionUseCase) private readonly createPromotion: CreatePromotionUseCase,
    @inject(UpdatePromotionUseCase) private readonly updatePromotion: UpdatePromotionUseCase,
    @inject(GetPromotionUseCase) private readonly getPromotion: GetPromotionUseCase,
    @inject(ListPromotionsUseCase) private readonly listPromotions: ListPromotionsUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'promotions', prefix: '/promotions', detail: { tags: ['Promotions'] } })
      .use(auth)
      .get(
        '/',
        async ({ query }) => {
          const result = await this.listPromotions.execute(query)
          return { items: result.items.map(snapshotOf), total: result.total }
        },
        {
          auth: true,
          query: promotionSchemas.listQuery,
          response: page(promotionSchemas.promotion),
          detail: { summary: 'รายการโปรโมชัน' },
        },
      )
      .get('/:id', async ({ params }) => snapshotOf(await this.getPromotion.execute(params)), {
        auth: true,
        params: idParams,
        response: promotionSchemas.promotion,
        detail: { summary: 'รายละเอียดโปรโมชัน' },
      })
      .post('/', async ({ body, user }) => snapshotOf(await this.createPromotion.execute(body, user)), {
        auth: { can: 'promotions.write' },
        body: promotionSchemas.create,
        response: promotionSchemas.promotion,
        detail: { summary: 'สร้างโปรโมชัน' },
      })
      .patch(
        '/:id',
        async ({ params, body, user }) => snapshotOf(await this.updatePromotion.execute(params.id, body, user)),
        {
          auth: { can: 'promotions.write' },
          params: idParams,
          body: promotionSchemas.update,
          response: promotionSchemas.promotion,
          detail: { summary: 'แก้ไขโปรโมชันและเปิด/ปิดใช้' },
        },
      )
  }
}
