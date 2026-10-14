import { inject, injectable } from 'tsyringe'
import type { DiningTableEntity } from '../../../../domains/dining-table.domain'
import { tableOccupancyToken } from '../ports/table-occupancy.port'
import type { ITableOccupancy } from '../ports/table-occupancy.port'
import { tableRepositoryToken } from '../ports/table.repository'
import type { ITableRepository } from '../ports/table.repository'

export interface TableWithOccupancy {
  table: DiningTableEntity
  openOrders: number
  openTotalSatang: number
}

/** Query: the tables of a branch, with how many orders are open on each and what they come to. */
@injectable()
export class ListTablesUseCase {
  constructor(
    @inject(tableRepositoryToken) private readonly tables: ITableRepository,
    @inject(tableOccupancyToken) private readonly occupancy: ITableOccupancy,
  ) {}

  async execute(branchId: number): Promise<TableWithOccupancy[]> {
    const [tables, open] = await Promise.all([this.tables.findAll(branchId), this.occupancy.byTable(branchId)])
    return tables.map((table) => ({
      table,
      openOrders: open.get(table.id)?.openOrders ?? 0,
      openTotalSatang: open.get(table.id)?.openTotalSatang ?? 0,
    }))
  }
}
