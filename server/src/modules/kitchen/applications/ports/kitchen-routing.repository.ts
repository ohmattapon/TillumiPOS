export interface IKitchenRoutingRepository {
  /** The station of each category that has one. A category missing from the map is not sent to the kitchen. */
  stationsByCategory(): Promise<Map<number, number>>
  /** Sets the station of one category, or with null takes it off the kitchen. */
  setStation(categoryId: number, stationId: number | null): Promise<void>
}

const kitchenRoutingRepositoryTokenSymbol: unique symbol = Symbol('IKitchenRoutingRepository')
export const kitchenRoutingRepositoryToken = kitchenRoutingRepositoryTokenSymbol.toString()
