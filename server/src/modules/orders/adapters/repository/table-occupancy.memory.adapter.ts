import { injectable } from 'tsyringe'
import type { ITableOccupancy, TableOccupancy } from '../../../tables/applications/ports/table-occupancy.port'
import { MemoryOrderRepository } from './order.memory.repository'

/**
 * Answers the tables module's question from the orders' own memory store, so
 * it never reads another module's tables. The demo composition root must
 * hand this the same MemoryOrderRepository singleton the order token gets.
 */
@injectable()
export class MemoryTableOccupancy implements ITableOccupancy {
  constructor(private readonly orders: MemoryOrderRepository) {}

  async byTable(branchId: number) {
    const open = await this.orders.findOpenOnTables(branchId)
    const occupancy = new Map<number, TableOccupancy>()
    for (const order of open) {
      const current = occupancy.get(order.tableId!) ?? { openOrders: 0, openTotalSatang: 0 }
      occupancy.set(order.tableId!, {
        openOrders: current.openOrders + 1,
        openTotalSatang:
          current.openTotalSatang +
          order.items.reduce((total, item) => total + item.unitPriceSatang * item.quantity, 0),
      })
    }
    return occupancy
  }

  async openOrderCount(tableId: number) {
    return this.orders.countOpenForTable(tableId)
  }
}
