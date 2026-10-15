import { inject, injectable } from 'tsyringe'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { categoryRepositoryToken } from '../../../categories/applications/ports/category.repository'
import type { ICategoryRepository } from '../../../categories/applications/ports/category.repository'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'
import { setCategoryStationSchema } from '../schemas/kitchen-schemas'

/** Command: decides which station the products of a category are prepared at. */
@injectable()
export class SetCategoryStationUseCase {
  constructor(
    @inject(categoryRepositoryToken) private readonly categories: ICategoryRepository,
    @inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository,
    @inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository,
  ) {}

  async execute(categoryId: number, input: unknown) {
    const { stationId } = setCategoryStationSchema.parse(input)

    if (!(await this.categories.findById(categoryId))) throw new DomainNotFoundError('ไม่พบหมวดหมู่')
    if (stationId !== null) {
      const station = await this.stations.findById(stationId)
      if (!station) throw new DomainNotFoundError('ไม่พบสถานีครัว', 'KITCHEN_STATION_NOT_FOUND')
      if (!station.isActive) throw new DomainConflictError('สถานีนี้ปิดใช้งานอยู่', 'KITCHEN_STATION_INACTIVE')
    }

    await this.routing.setStation(categoryId, stationId)
    return { categoryId, stationId }
  }
}
