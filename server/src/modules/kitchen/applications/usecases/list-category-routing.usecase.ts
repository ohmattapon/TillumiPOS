import { inject, injectable } from 'tsyringe'
import { kitchenRoutingRepositoryToken } from '../ports/kitchen-routing.repository'
import type { IKitchenRoutingRepository } from '../ports/kitchen-routing.repository'

/** Query: which station each category goes to. A category missing here is not sent to the kitchen. */
@injectable()
export class ListCategoryRoutingUseCase {
  constructor(@inject(kitchenRoutingRepositoryToken) private readonly routing: IKitchenRoutingRepository) {}

  async execute(): Promise<{ categoryId: number; stationId: number }[]> {
    return [...(await this.routing.stationsByCategory())].map(([categoryId, stationId]) => ({ categoryId, stationId }))
  }
}
