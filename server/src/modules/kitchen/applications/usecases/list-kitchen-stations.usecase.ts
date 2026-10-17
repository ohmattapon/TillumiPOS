import { inject, injectable } from 'tsyringe'
import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'

/** Query: every station of the shop, active or not, for the stations page and the till's choices. */
@injectable()
export class ListKitchenStationsUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(): Promise<KitchenStationEntity[]> {
    return this.stations.findAll()
  }
}
