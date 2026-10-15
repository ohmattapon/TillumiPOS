import { asc, eq } from 'drizzle-orm'
import { injectable } from 'tsyringe'
import { KitchenStationEntity } from '../../../../domains/kitchen-station.domain'
import { DomainConflictError } from '../../../../domains/errors/domain-conflict.error'
import { kitchenStations } from '../../../../infrastructure/database/schema/kitchen'
import { isUniqueViolation } from '../../../../libs/pg-error'
import { currentExecutor } from '../../../../libs/transaction-context'
import type { IKitchenStationRepository } from '../../applications/ports/kitchen-station.repository'

const nameTaken = () => new DomainConflictError('ชื่อสถานีนี้ถูกใช้แล้ว', 'KITCHEN_STATION_NAME_TAKEN')

const toEntity = (row: typeof kitchenStations.$inferSelect) =>
  new KitchenStationEntity({ id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive })

@injectable()
export class DrizzleKitchenStationRepository implements IKitchenStationRepository {
  async findAll() {
    const rows = await currentExecutor()
      .select()
      .from(kitchenStations)
      .orderBy(asc(kitchenStations.sortOrder), asc(kitchenStations.name))
    return rows.map(toEntity)
  }

  async findById(id: number) {
    const [row] = await currentExecutor().select().from(kitchenStations).where(eq(kitchenStations.id, id))
    return row ? toEntity(row) : null
  }

  async create(station: KitchenStationEntity) {
    try {
      const [row] = await currentExecutor()
        .insert(kitchenStations)
        .values({ name: station.name, sortOrder: station.sortOrder, isActive: station.isActive })
        .returning()
      return toEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }

  async update(station: KitchenStationEntity) {
    try {
      const [row] = await currentExecutor()
        .update(kitchenStations)
        .set({ name: station.name, sortOrder: station.sortOrder, isActive: station.isActive, updatedAt: new Date() })
        .where(eq(kitchenStations.id, station.id))
        .returning()
      return toEntity(row!)
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken()
      throw error
    }
  }
}
