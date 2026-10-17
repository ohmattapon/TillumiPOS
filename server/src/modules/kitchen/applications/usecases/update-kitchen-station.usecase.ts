import { inject, injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { kitchenStationRepositoryToken } from '../ports/kitchen-station.repository'
import type { IKitchenStationRepository } from '../ports/kitchen-station.repository'
import { updateKitchenStationSchema } from '../schemas/kitchen-schemas'

/** Command: renames a station, moves it in the list, or turns it on and off. Stations are never deleted. */
@injectable()
export class UpdateKitchenStationUseCase {
  constructor(@inject(kitchenStationRepositoryToken) private readonly stations: IKitchenStationRepository) {}

  async execute(id: number, input: unknown) {
    const changes = updateKitchenStationSchema.parse(input)
    const existing = await this.stations.findById(id)
    if (!existing) throw new DomainNotFoundError('ไม่พบสถานีครัว', 'KITCHEN_STATION_NOT_FOUND')
    return this.stations.update(existing.with(changes))
  }
}
