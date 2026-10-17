import { inject, injectable } from 'tsyringe'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { createKitchenStationSchema } from '../schemas/kitchen-schemas'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'

/** Command: adds a station, active from the start. */
@injectable()
export class CreateKitchenStationUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(input: unknown) {
    const { name, sortOrder } = createKitchenStationSchema.parse(input)
    return this.stations.create(new KitchenStationEntity({ id: 0, name, sortOrder: sortOrder ?? 0, isActive: true }))
  }
}
