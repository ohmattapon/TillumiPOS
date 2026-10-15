import { Elysia } from 'elysia'
import { inject, injectable } from 'tsyringe'
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { idParams, page } from '../../../../libs/http-schemas'
import { auth } from '../../../auth.plugin'
import { CreateKitchenStationUseCase } from '../../applications/usecases/create-kitchen-station.usecase'
import { ListKitchenStationsUseCase } from '../../applications/usecases/list-kitchen-stations.usecase'
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
        auth: ['owner'],
        body: kitchenSchemas.createStation,
        response: kitchenSchemas.station,
        detail: { summary: 'เพิ่มสถานีครัว' },
      })
      .patch(
        '/kitchen-stations/:id',
        async ({ params, body }) => toStationResponse(await this.updateStation.execute(params.id, body)),
        {
          auth: ['owner'],
          params: idParams,
          body: kitchenSchemas.updateStation,
          response: kitchenSchemas.station,
          detail: { summary: 'แก้ไขสถานีครัว (ชื่อ ลำดับ เปิดปิด)' },
        },
      )
  }
}
