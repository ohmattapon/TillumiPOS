import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateKitchenStationUseCase } from '../../applications/usecases/create-kitchen-station.usecase'
import { ListCategoryRoutingUseCase } from '../../applications/usecases/list-category-routing.usecase'
import { ListKitchenStationsUseCase } from '../../applications/usecases/list-kitchen-stations.usecase'
import { SetCategoryStationUseCase } from '../../applications/usecases/set-category-station.usecase'
import { UpdateKitchenStationUseCase } from '../../applications/usecases/update-kitchen-station.usecase'
import { kitchenSchemas, type KitchenStationResponse } from './schemas/kitchen.schema'

const toStationResponse = (station: KitchenStationEntity): KitchenStationResponse => station.toSnapshot()

/**
 * Routes under the catalog prefix (`/api/v1/catalog`). They are full paths, not a group prefix, because the
 * catalog also holds category routes, which need their own paths.
 */
@injectable()
export class KitchenCatalogElysiaController {
  constructor(
    @inject(ListKitchenStationsUseCase) private readonly listStations: ListKitchenStationsUseCase,
    @inject(CreateKitchenStationUseCase) private readonly createStation: CreateKitchenStationUseCase,
    @inject(UpdateKitchenStationUseCase) private readonly updateStation: UpdateKitchenStationUseCase,
    @inject(SetCategoryStationUseCase) private readonly setCategoryStation: SetCategoryStationUseCase,
    @inject(ListCategoryRoutingUseCase) private readonly listRouting: ListCategoryRoutingUseCase,
  ) {}

  getRoutes() {
    return new Elysia({ name: 'catalog.kitchen', detail: { tags: ['Catalog'] } })
      .use(auth)
      .get(
        '/kitchen-stations',
        async () => {
          const items = (await this.listStations.execute()).map(toStationResponse)
          return { items, total: items.length }
        },
        { auth: true, response: page(kitchenSchemas.station), detail: { summary: 'สถานีครัว (รวมที่ปิดอยู่)' } },
      )
      .post('/kitchen-stations', async ({ body }) => toStationResponse(await this.createStation.execute(body)), {
        auth: { can: 'kitchen.write' },
        body: kitchenSchemas.createStation,
        response: kitchenSchemas.station,
        detail: { summary: 'เพิ่มสถานีครัว' },
      })
      .patch(
        '/kitchen-stations/:id',
        async ({ params, body }) => toStationResponse(await this.updateStation.execute(params.id, body)),
        {
          auth: { can: 'kitchen.write' },
          params: idParams,
          body: kitchenSchemas.updateStation,
          response: kitchenSchemas.station,
          detail: { summary: 'แก้ไขสถานีครัว (ชื่อ ลำดับ เปิดปิด)' },
        },
      )
      .put(
        '/categories/:id/kitchen-station',
        async ({ params, body }) => this.setCategoryStation.execute(params.id, body),
        {
          auth: { can: 'kitchen.write' },
          params: idParams,
          body: kitchenSchemas.categoryStation,
          response: kitchenSchemas.categoryStationResponse,
          detail: { summary: 'ผูกหมวดกับสถานีครัว (ไม่ส่งครัวเมื่อเป็น null)' },
        },
      )
      .get(
        '/kitchen-routing',
        async () => {
          const items = await this.listRouting.execute()
          return { items, total: items.length }
        },
        {
          auth: true,
          response: page(kitchenSchemas.categoryStationResponse),
          detail: { summary: 'หมวดแต่ละหมวดส่งไปสถานีไหน' },
        },
      )
  }
}
