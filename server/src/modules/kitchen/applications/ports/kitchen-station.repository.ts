import type { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'

export interface IKitchenStationRepository {
  /** Every station, active or not, ordered by sort order then name. */
  findAll(): Promise<KitchenStationEntity[]>
  findById(id: number): Promise<KitchenStationEntity | null>
  /** Throws DomainConflictError KITCHEN_STATION_NAME_TAKEN for a name that is already used. */
  create(station: KitchenStationEntity): Promise<KitchenStationEntity>
  update(station: KitchenStationEntity): Promise<KitchenStationEntity>
}

const kitchenStationRepositoryTokenSymbol: unique symbol = Symbol('IKitchenStationRepository')
export const kitchenStationRepositoryToken = kitchenStationRepositoryTokenSymbol.toString()
