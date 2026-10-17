/** The station the kitchen board shows: the asked-for one if it exists, else the first active one, else the first of all. */
export const defaultStationId = (stations: readonly { id: number; isActive: boolean }[], requested: number) =>
  stations.find((station) => station.id === requested)?.id ??
  stations.find((station) => station.isActive)?.id ??
  stations[0]?.id ??
  0
