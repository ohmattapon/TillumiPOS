export interface TableOccupancy {
  openOrders: number
  openTotalSatang: number
}

/** What is open on the tables. Owned here, answered by the orders module from its own data. */
export interface ITableOccupancy {
  /** Open orders of the branch grouped by table; a table with none is absent. */
  byTable(branchId: number): Promise<Map<number, TableOccupancy>>
  openOrderCount(tableId: number): Promise<number>
}

const tableOccupancyTokenSymbol: unique symbol = Symbol('ITableOccupancy')
export const tableOccupancyToken = tableOccupancyTokenSymbol.toString()
