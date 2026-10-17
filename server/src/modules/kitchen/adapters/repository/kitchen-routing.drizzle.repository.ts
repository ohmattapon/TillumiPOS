import { eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { DomainNotFoundError } from '../../../../domains/errors/domain-not-found.error'
import { kitchenCategoryStations } from '../../../../infrastructure/database/schema/kitchen'
import { isForeignKeyViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenRoutingRepository } from '../../applications/ports/kitchen-routing.repository'

@injectable()
export class DrizzleKitchenRoutingRepository implements IKitchenRoutingRepository {
  async stationsByCategory() {
    const rows = await currentExecutor()
      .select({ categoryId: kitchenCategoryStations.categoryId, stationId: kitchenCategoryStations.stationId })
      .from(kitchenCategoryStations)
    return new Map(rows.map((row) => [row.categoryId, row.stationId]))
  }

  async setStation(categoryId: number, stationId: number | null) {
    const executor = currentExecutor()
    if (stationId === null) {
      await executor.delete(kitchenCategoryStations).where(eq(kitchenCategoryStations.categoryId, categoryId))
      return
    }
    try {
      await executor
        .insert(kitchenCategoryStations)
        .values({ categoryId, stationId })
        .onConflictDoUpdate({ target: kitchenCategoryStations.categoryId, set: { stationId } })
    } catch (error) {
      // Only reachable if the category or the station vanished between the use case's read and this write.
      if (isForeignKeyViolation(error)) throw new DomainNotFoundError('ไม่พบหมวดหมู่หรือสถานีครัว')
      throw error
    }
  }
}
